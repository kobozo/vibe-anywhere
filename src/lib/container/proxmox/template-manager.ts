/**
 * Proxmox Template Manager
 * Handles creation and management of LXC templates via pure API calls
 */

import { config } from '@/lib/config';
import { ProxmoxClient, getProxmoxClient } from './client';
import { pollTaskUntilComplete, waitForContainerIp, waitForContainerRunning } from './task-poller';
import { execSSHCommand } from './ssh-stream';
import { getSettingsService, type ProxmoxTemplateSettings } from '@/lib/services/settings-service';
import * as fs from 'fs';

// Default Debian template to use
const DEFAULT_OS_TEMPLATE = 'debian-12-standard';

// Provisioning script to run inside the container
const PROVISIONING_SCRIPT = `
set -e

export DEBIAN_FRONTEND=noninteractive

echo "=== Starting template provisioning ==="

# Update package lists
echo "[1/10] Updating package lists..."
apt-get update

# Install base packages
echo "[2/10] Installing base packages..."
apt-get install -y \\
    curl \\
    git \\
    openssh-server \\
    sudo \\
    ca-certificates \\
    gnupg \\
    lsb-release \\
    wget \\
    build-essential \\
    rsync

# Install Node.js 22
echo "[3/10] Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Install Claude Code CLI
echo "[4/10] Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code
echo "Claude version: $(claude --version || echo 'installed')"

# Install lazygit (optional, non-fatal if fails)
echo "[5/10] Installing lazygit..."
LAZYGIT_VERSION="0.44.1"
if curl -fsSL -o /tmp/lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/download/v\${LAZYGIT_VERSION}/lazygit_\${LAZYGIT_VERSION}_Linux_x86_64.tar.gz"; then
    tar xf /tmp/lazygit.tar.gz -C /tmp lazygit
    install /tmp/lazygit -D -t /usr/local/bin/
    rm -f /tmp/lazygit.tar.gz /tmp/lazygit
    echo "lazygit installed"
else
    echo "Warning: lazygit installation failed (non-fatal)"
fi

# Install tmux
echo "[6/10] Installing tmux..."
apt-get install -y tmux

# Configure tmux
cat > /etc/tmux.conf << 'TMUXEOF'
# Session Hub tmux configuration
# Disable mouse mode to allow browser text selection
set -g mouse off

# Better terminal colors
set -g default-terminal "xterm-256color"
set -ga terminal-overrides ",xterm-256color:Tc"

# Increase scrollback buffer
set -g history-limit 50000

# No delay for escape key
set -sg escape-time 0

# Start window numbering at 1
set -g base-index 1
setw -g pane-base-index 1
TMUXEOF
chmod 644 /etc/tmux.conf

# Create kobozo user for running Claude sessions
echo "[7/10] Creating kobozo user..."
if ! id kobozo &>/dev/null; then
    useradd -m -s /bin/bash kobozo
    echo "kobozo:SessionHub2024!" | chpasswd
    usermod -aG sudo kobozo
    echo "kobozo ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/kobozo
    chmod 440 /etc/sudoers.d/kobozo
fi

# Create workspace directory
echo "[8/10] Creating workspace directory..."
mkdir -p /workspace
chown kobozo:kobozo /workspace
chmod 755 /workspace

# Setup Session Hub agent
echo "[9/10] Setting up Session Hub agent..."
mkdir -p /opt/session-hub-agent
chown -R kobozo:kobozo /opt/session-hub-agent

# Create systemd service for agent
cat > /etc/systemd/system/session-hub-agent.service << 'EOF'
[Unit]
Description=Session Hub Sidecar Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=kobozo
Group=kobozo
WorkingDirectory=/opt/session-hub-agent
ExecStart=/usr/bin/node /opt/session-hub-agent/dist/index.js
Restart=always
RestartSec=5
EnvironmentFile=-/etc/session-hub-agent.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable session-hub-agent

# Configure SSH
echo "[10/10] Configuring SSH and git..."
systemctl enable ssh

# Configure git globally
git config --global init.defaultBranch main
git config --global user.email "claude@session-hub.local"
git config --global user.name "Claude Code"
git config --global --add safe.directory /workspace

# Configure git for kobozo user
su - kobozo -c "git config --global init.defaultBranch main"
su - kobozo -c "git config --global user.email 'claude@session-hub.local'"
su - kobozo -c "git config --global user.name 'Claude Code'"
su - kobozo -c "git config --global --add safe.directory /workspace"

# Create Claude config directories
mkdir -p /root/.claude
chmod 700 /root/.claude
mkdir -p /home/kobozo/.claude
chown kobozo:kobozo /home/kobozo/.claude
chmod 700 /home/kobozo/.claude

# Cleanup
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "=== Template provisioning complete ==="
`;

export interface NodeInfo {
  node: string;
  autoSelected: boolean;
  allNodes: string[];
}

export interface TemplateStatus {
  exists: boolean;
  vmid: number | null;
  isTemplate: boolean;
  sshKeyConfigured: boolean;
  nodes: string[];
  selectedNode: string | null;
}

export interface CreateTemplateProgress {
  step: string;
  progress: number;
  message: string;
}

export type ProgressCallback = (progress: CreateTemplateProgress) => void;

/**
 * Manages Proxmox LXC templates for Session Hub
 */
export class ProxmoxTemplateManager {
  private client: ProxmoxClient;

  constructor(client?: ProxmoxClient) {
    this.client = client || getProxmoxClient();
  }

  /**
   * Get available nodes with auto-selection logic
   */
  async getNodes(): Promise<NodeInfo> {
    const nodes = await this.client.getNodes();
    const nodeNames = nodes.map(n => n.node);

    if (nodeNames.length === 1) {
      return {
        node: nodeNames[0],
        autoSelected: true,
        allNodes: nodeNames,
      };
    }

    // Auto-select first node, but indicate user should confirm
    return {
      node: nodeNames[0],
      autoSelected: false,
      allNodes: nodeNames,
    };
  }

  /**
   * Get the template VMID from database settings
   * Returns the configured starting VMID (default 500) for template creation
   * Returns the actual template VMID if template exists
   */
  async getTemplateVmid(): Promise<number> {
    const settingsService = getSettingsService();

    // First check if template already exists
    const existingTemplate = await settingsService.getProxmoxTemplateVmid();
    if (existingTemplate) {
      return existingTemplate;
    }

    // Otherwise return the configured starting VMID
    return await settingsService.getTemplateVmid();
  }

  /**
   * Get current template status
   */
  async getTemplateStatus(): Promise<TemplateStatus> {
    const nodeInfo = await this.getNodes();
    const settingsService = getSettingsService();

    // Check if template exists in database (meaning it was created)
    const existingTemplateVmid = await settingsService.getProxmoxTemplateVmid();
    // Get the configured starting VMID for display
    const configuredVmid = await settingsService.getTemplateVmid();

    if (!existingTemplateVmid) {
      // No template created yet - show the configured starting VMID
      return {
        exists: false,
        vmid: configuredVmid,
        isTemplate: false,
        sshKeyConfigured: false,
        nodes: nodeInfo.allNodes,
        selectedNode: nodeInfo.node,
      };
    }

    try {
      const status = await this.client.getLxcStatus(existingTemplateVmid);
      const lxcConfig = await this.client.getLxcConfig(existingTemplateVmid);

      return {
        exists: true,
        vmid: existingTemplateVmid,
        isTemplate: !!lxcConfig.template,
        sshKeyConfigured: true, // If template exists, assume SSH is configured
        nodes: nodeInfo.allNodes,
        selectedNode: nodeInfo.node,
      };
    } catch {
      // Template record exists in DB but not in Proxmox - clear the stale record
      await settingsService.clearProxmoxTemplateSettings();
      return {
        exists: false,
        vmid: configuredVmid,
        isTemplate: false,
        sshKeyConfigured: false,
        nodes: nodeInfo.allNodes,
        selectedNode: nodeInfo.node,
      };
    }
  }

  /**
   * Get Session Hub's SSH public key
   */
  getSSHPublicKey(): string | null {
    const keyPaths = [
      '/home/sessionhub/.ssh/id_ed25519.pub',
      '/root/.ssh/id_ed25519.pub',
      process.env.HOME + '/.ssh/id_ed25519.pub',
    ];

    for (const keyPath of keyPaths) {
      try {
        return fs.readFileSync(keyPath, 'utf-8').trim();
      } catch {
        // Try next path
      }
    }

    return null;
  }

  /**
   * Ensure OS appliance template exists in storage
   * Note: OS templates (vztmpl) must be stored on 'local' or similar storage
   * that supports the 'vztmpl' content type. LVM storage doesn't support templates.
   */
  async ensureOsTemplate(): Promise<string> {
    const templateName = DEFAULT_OS_TEMPLATE;
    // OS templates (vztmpl) are always stored on 'local' storage
    // This is separate from the container rootfs storage
    const templateStorageId = 'local';

    // Check if template already exists
    const templatePath = await this.client.getApplianceTemplatePath(templateName, templateStorageId);
    if (templatePath) {
      console.log(`OS template found: ${templatePath}`);
      return templatePath;
    }

    // Find the exact template name from available appliances
    const appliances = await this.client.listAppliances();
    const debianTemplate = appliances.find(a =>
      a.template.includes(templateName) || a.package.includes(templateName)
    );

    if (!debianTemplate) {
      throw new Error(`No Debian template found. Available: ${appliances.map(a => a.template).join(', ')}`);
    }

    console.log(`Downloading OS template: ${debianTemplate.template}`);
    const upid = await this.client.downloadAppliance(debianTemplate.template, templateStorageId);
    await pollTaskUntilComplete(this.client, upid, {
      timeoutMs: 300000, // 5 minutes for download
      onProgress: (status) => console.log(`Download: ${status}`),
    });

    // Get the path again after download
    const newPath = await this.client.getApplianceTemplatePath(templateName, templateStorageId);
    if (!newPath) {
      throw new Error('Template download completed but template not found in storage');
    }

    return newPath;
  }

  /**
   * Create a new template with SSH keys pre-configured
   */
  async createTemplate(
    vmid: number,
    options: {
      storage?: string;
      node?: string;
      onProgress?: ProgressCallback;
    } = {}
  ): Promise<void> {
    const { storage, onProgress } = options;
    const storageId = storage || config.proxmox.storage || 'local-lvm';

    const progress = (step: string, pct: number, msg: string) => {
      console.log(`[${pct}%] ${step}: ${msg}`);
      onProgress?.({ step, progress: pct, message: msg });
    };

    // Step 1: Get SSH public key
    progress('ssh-key', 5, 'Reading SSH public key...');
    const sshPublicKey = this.getSSHPublicKey();
    if (!sshPublicKey) {
      throw new Error('No SSH public key found. Please ensure SSH keys are mounted.');
    }

    // Step 2: Ensure OS template exists (always on 'local' storage)
    progress('os-template', 10, 'Checking OS template...');
    const osTemplate = await this.ensureOsTemplate();
    progress('os-template', 15, `Using OS template: ${osTemplate}`);

    // Step 3: Create container with SSH keys
    progress('create', 20, 'Creating container...');
    const upid = await this.client.createLxcWithSSHKeys(vmid, osTemplate, {
      hostname: 'session-hub-template',
      description: 'Session Hub Claude instance template',
      storage: storageId,
      memory: config.proxmox.memoryMb || 2048,
      cores: config.proxmox.cores || 2,
      sshPublicKeys: sshPublicKey,
      rootPassword: 'SessionHub2024!',
    });

    await pollTaskUntilComplete(this.client, upid, {
      timeoutMs: 120000,
      onProgress: (status) => progress('create', 25, status),
    });

    // Step 4: Start container
    progress('start', 30, 'Starting container...');
    const startUpid = await this.client.startLxc(vmid);
    await pollTaskUntilComplete(this.client, startUpid, { timeoutMs: 60000 });
    await waitForContainerRunning(this.client, vmid);

    // Step 5: Wait for network
    progress('network', 35, 'Waiting for network...');
    const containerIp = await waitForContainerIp(this.client, vmid, { timeoutMs: 60000 });
    progress('network', 40, `Container IP: ${containerIp}`);

    // Step 6: Provision the container via SSH
    progress('provision', 45, 'Provisioning container (this may take several minutes)...');
    try {
      await this.provisionContainer(containerIp, (msg) => {
        progress('provision', 70, msg);
      });
    } catch (error) {
      // Cleanup on failure
      console.error('Provisioning failed, cleaning up...', error);
      try {
        await this.client.stopLxc(vmid);
        await this.client.deleteLxc(vmid);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }

    // Step 7: Stop container
    progress('stop', 85, 'Stopping container...');
    const stopUpid = await this.client.shutdownLxc(vmid, 30);
    await pollTaskUntilComplete(this.client, stopUpid, { timeoutMs: 60000 });

    // Wait for container to fully stop
    for (let i = 0; i < 30; i++) {
      const status = await this.client.getLxcStatus(vmid);
      if (status.status === 'stopped') break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Step 8: Convert to template
    progress('template', 95, 'Converting to template...');
    await this.client.convertToTemplate(vmid);

    // Step 9: Save template settings to database
    progress('save', 98, 'Saving template configuration...');
    const settingsService = getSettingsService();
    await settingsService.saveProxmoxTemplateSettings({
      vmid,
      node: options.node || this.client.getNodeName(),
      storage: storageId,
      createdAt: new Date().toISOString(),
    });

    progress('complete', 100, 'Template created successfully!');
  }

  /**
   * Provision the container with required software via SSH
   */
  private async provisionContainer(
    containerIp: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    const sshUser = 'root';

    // Wait for SSH to be available
    onProgress?.('Waiting for SSH...');
    for (let i = 0; i < 30; i++) {
      try {
        await execSSHCommand(
          { host: containerIp, username: sshUser },
          ['echo', 'SSH ready'],
          { workingDir: '/' }
        );
        break;
      } catch {
        if (i === 29) throw new Error('SSH not available after 60 seconds');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Run provisioning script
    onProgress?.('Running provisioning script...');
    const result = await execSSHCommand(
      { host: containerIp, username: sshUser },
      ['bash', '-c', PROVISIONING_SCRIPT],
      { workingDir: '/' }
    );

    if (result.exitCode !== 0) {
      console.error('Provisioning stderr:', result.stderr);
      throw new Error(`Provisioning failed with exit code ${result.exitCode}`);
    }

    onProgress?.('Provisioning complete');
  }

  /**
   * Delete an existing template
   */
  async deleteTemplate(vmid: number): Promise<void> {
    try {
      const status = await this.client.getLxcStatus(vmid);
      if (status.status !== 'stopped') {
        const stopUpid = await this.client.stopLxc(vmid);
        await pollTaskUntilComplete(this.client, stopUpid, { timeoutMs: 60000 });
      }
    } catch {
      // Container might not exist, continue with deletion attempt
    }

    try {
      const deleteUpid = await this.client.deleteLxc(vmid, true);
      await pollTaskUntilComplete(this.client, deleteUpid, { timeoutMs: 60000 });
    } catch (error) {
      // If container doesn't exist, that's fine
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!errorMsg.includes('does not exist') && !errorMsg.includes('not found')) {
        throw error;
      }
    }

    // Clear the settings from database
    const settingsService = getSettingsService();
    await settingsService.clearProxmoxTemplateSettings();
  }
}

// Singleton instance
let templateManagerInstance: ProxmoxTemplateManager | null = null;

export function getProxmoxTemplateManager(): ProxmoxTemplateManager {
  if (!templateManagerInstance) {
    templateManagerInstance = new ProxmoxTemplateManager();
  }
  return templateManagerInstance;
}

/**
 * Proxmox Template Manager
 * Handles creation and management of LXC templates via pure API calls
 */

import { config } from '@/lib/config';
import { ProxmoxClient, getProxmoxClient } from './client';
import { pollTaskUntilComplete, waitForContainerIp, waitForContainerRunning } from './task-poller';
import { execSSHCommand } from './ssh-stream';
import { getSettingsService, type ProxmoxTemplateSettings } from '@/lib/services/settings-service';
import { generateInstallScript, requiresNesting } from './tech-stacks';
import { buildTemplateTags } from './tags';
import * as fs from 'fs';

// Default Debian template to use
const DEFAULT_OS_TEMPLATE = 'debian-12-standard';

/**
 * Core provisioning script - Essential packages only
 * Node.js is always installed because the Session Hub agent requires it
 * Other tech stacks (Python, etc.) are installed separately based on configuration
 */
const CORE_PROVISIONING_SCRIPT = `
set -e

export DEBIAN_FRONTEND=noninteractive

echo "=== Starting core template provisioning ==="

# Update package lists
echo "[1/9] Updating package lists..."
apt-get update

# Install base packages (essential for all workspaces)
echo "[2/9] Installing base packages..."
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
    rsync \\
    vim \\
    jq

# Install GitHub CLI
echo "[3/9] Installing GitHub CLI..."
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update
apt-get install -y gh
echo "GitHub CLI version: \$(gh --version | head -1)"

# Install tmux
echo "[4/9] Installing tmux..."
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

# Install Node.js 22 (required for Session Hub agent)
echo "[5/9] Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
echo "Node.js version: \$(node --version)"
echo "npm version: \$(npm --version)"

# Create kobozo user for running Claude sessions
echo "[6/9] Creating kobozo user..."
if ! id kobozo &>/dev/null; then
    useradd -m -s /bin/bash kobozo
    echo "kobozo:SessionHub2024!" | chpasswd
    usermod -aG sudo kobozo
    echo "kobozo ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/kobozo
    chmod 440 /etc/sudoers.d/kobozo
fi

# Create workspace directory
echo "[7/9] Creating workspace directory..."
mkdir -p /workspace
chown kobozo:kobozo /workspace
chmod 755 /workspace

# Setup Session Hub agent directory
echo "[8/9] Setting up Session Hub agent..."
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

# Configure SSH and git
echo "[9/9] Configuring SSH and git..."
systemctl enable ssh

# Configure git globally
git config --global init.defaultBranch main
git config --global user.email "claude@session-hub.local"
git config --global user.name "Claude Code"
git config --global --add safe.directory /workspace
git config --global --add safe.directory '*'

# Configure git for kobozo user
su - kobozo -c "git config --global init.defaultBranch main"
su - kobozo -c "git config --global user.email 'claude@session-hub.local'"
su - kobozo -c "git config --global user.name 'Claude Code'"
su - kobozo -c "git config --global --add safe.directory /workspace"
su - kobozo -c "git config --global --add safe.directory '*'"

# Configure GitHub CLI to use SSH (will use SSH keys synced to workspace)
su - kobozo -c "gh config set git_protocol ssh --host github.com"

# Create Claude config directories
mkdir -p /root/.claude
chmod 700 /root/.claude
mkdir -p /home/kobozo/.claude
chown kobozo:kobozo /home/kobozo/.claude
chmod 700 /home/kobozo/.claude

echo "=== Core template provisioning complete ==="
`;

/**
 * Cleanup script to run after all installations
 */
const CLEANUP_SCRIPT = `
echo "=== Cleaning up ==="
apt-get clean
rm -rf /var/lib/apt/lists/*
echo "=== Cleanup complete ==="
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
export type LogCallback = (type: 'stdout' | 'stderr', data: string) => void;

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
   * @param baseCtTemplate - Can be either:
   *   - Full volid: 'local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst'
   *   - Simple name: 'debian-12-standard' (will look up/download)
   */
  async ensureOsTemplate(baseCtTemplate?: string): Promise<string> {
    const templateInput = baseCtTemplate || DEFAULT_OS_TEMPLATE;

    // If it's a full volid (contains ':'), verify it exists and return it directly
    if (templateInput.includes(':')) {
      // Extract storage and verify the template exists
      const [storageId] = templateInput.split(':');

      // List templates from this storage to verify it exists
      const storedTemplates = await this.client.listStoredCtTemplates();
      const found = storedTemplates.find(t => t.volid === templateInput);

      if (found) {
        console.log(`Using CT template: ${templateInput}`);
        return templateInput;
      }

      // Template specified but not found - this is an error
      throw new Error(`CT template '${templateInput}' not found in storage '${storageId}'`);
    }

    // Simple name provided - use legacy lookup logic
    const templateName = templateInput;
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
    const osTemplate = appliances.find(a =>
      a.template.includes(templateName) || a.package.includes(templateName)
    );

    if (!osTemplate) {
      throw new Error(`CT template '${templateName}' not found. Available: ${appliances.map(a => a.template).join(', ')}`);
    }

    console.log(`Downloading OS template: ${osTemplate.template}`);
    const upid = await this.client.downloadAppliance(osTemplate.template, templateStorageId);
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
   * @param stopAtStaging - If true, keeps container running for manual customization
   * @param parentVmid - If provided, clone from this parent template instead of base OS
   * @param baseCtTemplate - CT template to use as base (e.g., 'debian-12-standard')
   * @returns Container IP if staging mode, otherwise void
   */
  async createTemplate(
    vmid: number,
    options: {
      name?: string;
      storage?: string;
      node?: string;
      techStacks?: string[];
      stopAtStaging?: boolean;
      parentVmid?: number; // Clone from parent template instead of base OS
      baseCtTemplate?: string; // CT template to use as base (e.g., 'debian-12-standard', 'ubuntu-22.04-standard')
      onProgress?: ProgressCallback;
      onLog?: LogCallback;
    } = {}
  ): Promise<{ containerIp?: string }> {
    const { name, storage, onProgress, techStacks = [], parentVmid, baseCtTemplate } = options;
    const settingsService = getSettingsService();

    // Get settings from database
    const proxmoxSettings = await settingsService.getProxmoxSettings();
    const storageId = storage || proxmoxSettings.defaultStorage || config.proxmox.storage || 'local-lvm';
    const memory = proxmoxSettings.defaultMemory || config.proxmox.memoryMb || 2048;
    const cores = proxmoxSettings.defaultCpuCores || config.proxmox.cores || 2;
    const vlanTag = proxmoxSettings.vlanTag ?? config.proxmox.vlanTag;

    // Check if any selected tech stack requires nesting (e.g., Docker)
    const needsNesting = requiresNesting(techStacks);

    const progress = (step: string, pct: number, msg: string) => {
      console.log(`[${pct}%] ${step}: ${msg}`);
      onProgress?.({ step, progress: pct, message: msg });
    };

    // Generate hostname from name (sanitize for valid hostname)
    const hostname = (name || 'session-hub-template')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 63) || 'session-hub-template';

    // Determine if we're cloning from a parent template or creating from base OS
    if (parentVmid) {
      // Clone from parent template
      progress('clone', 5, `Cloning from parent template VMID ${parentVmid}...`);

      const cloneUpid = await this.client.cloneLxc(parentVmid, vmid, {
        hostname,
        description: name ? `Session Hub template: ${name}` : 'Session Hub Claude instance template',
        storage: storageId,
        full: true, // Full clone for templates
      });

      await pollTaskUntilComplete(this.client, cloneUpid, {
        timeoutMs: 300000, // 5 minutes for clone
        onProgress: (status) => progress('clone', 20, status),
      });

      // Update container config if nesting is needed (e.g., for Docker)
      if (needsNesting) {
        progress('config', 25, 'Enabling LXC nesting for Docker support...');
        await this.client.setLxcConfig(vmid, { features: 'nesting=1' });
      }

      // Set tags on cloned template (clone API doesn't support tags)
      const templateTags = buildTemplateTags(techStacks);
      try {
        await this.client.setLxcConfig(vmid, { tags: templateTags });
        console.log(`Set tags for template ${vmid}: ${templateTags}`);
      } catch (tagError) {
        console.warn(`Could not set tags for template ${vmid}:`, tagError);
      }
    } else {
      // Create from base OS template (original flow)
      // Step 1: Get SSH public key
      progress('ssh-key', 5, 'Reading SSH public key...');
      const sshPublicKey = this.getSSHPublicKey();
      if (!sshPublicKey) {
        throw new Error('No SSH public key found. Please ensure SSH keys are mounted.');
      }

      // Step 2: Ensure OS template exists (always on 'local' storage)
      progress('os-template', 10, `Checking CT template: ${baseCtTemplate || DEFAULT_OS_TEMPLATE}...`);
      const osTemplate = await this.ensureOsTemplate(baseCtTemplate);
      progress('os-template', 15, `Using OS template: ${osTemplate}`);

      // Step 3: Create container with SSH keys
      progress('create', 20, 'Creating container...');
      const templateTags = buildTemplateTags(techStacks);
      const upid = await this.client.createLxcWithSSHKeys(vmid, osTemplate, {
        hostname,
        description: name ? `Session Hub template: ${name}` : 'Session Hub Claude instance template',
        storage: storageId,
        memory,
        cores,
        sshPublicKeys: sshPublicKey,
        rootPassword: 'SessionHub2024!',
        vlanTag,
        features: needsNesting ? 'nesting=1' : undefined,
        tags: templateTags,
      });

      await pollTaskUntilComplete(this.client, upid, {
        timeoutMs: 120000,
        onProgress: (status) => progress('create', 25, status),
      });
    }

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
    // If cloning from parent, skip core provisioning (already done in parent) and only install new tech stacks
    // If staging mode, skip cleanup so user can do manual customization first
    try {
      if (parentVmid) {
        // Cloned from parent - only install new tech stacks (if any)
        if (techStacks.length > 0) {
          progress('provision', 45, `Installing additional tech stacks: ${techStacks.join(', ')}...`);
          await this.provisionTechStacksOnly(containerIp, techStacks, (msg) => {
            progress('provision', 70, msg);
          }, options.stopAtStaging, options.onLog);
        } else {
          progress('provision', 70, 'No additional software to install (using parent configuration)');
          // Still run cleanup if not staging
          if (!options.stopAtStaging) {
            progress('provision', 75, 'Cleaning up...');
            await this.runCleanup(containerIp, options.onLog);
          }
        }
      } else {
        // New template from base OS - full provisioning
        progress('provision', 45, 'Provisioning container (this may take several minutes)...');
        await this.provisionContainer(containerIp, techStacks, (msg) => {
          progress('provision', 70, msg);
        }, options.stopAtStaging, options.onLog); // Skip cleanup if staging
      }
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

    // Check if we should stop at staging for manual customization
    if (options.stopAtStaging) {
      progress('staging', 80, 'Container ready for staging - connect via SSH to customize');
      return { containerIp };
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
    await settingsService.saveProxmoxTemplateSettings({
      vmid,
      node: options.node || this.client.getNodeName(),
      storage: storageId,
      createdAt: new Date().toISOString(),
    });

    progress('complete', 100, 'Template created successfully!');
    return {};
  }

  /**
   * Finalize a staging template by running cleanup, stopping it, and converting to template
   */
  async finalizeTemplate(
    vmid: number,
    options: {
      node?: string;
      containerIp?: string;
      onProgress?: ProgressCallback;
      onLog?: LogCallback;
    } = {}
  ): Promise<void> {
    const progress = (step: string, pct: number, msg: string) => {
      console.log(`[${pct}%] ${step}: ${msg}`);
      options.onProgress?.({ step, progress: pct, message: msg });
    };

    // Step 1: Run cleanup script if we have the container IP
    if (options.containerIp) {
      progress('cleanup', 10, 'Running cleanup script...');
      try {
        await this.runCleanup(options.containerIp, options.onLog);
        progress('cleanup', 30, 'Cleanup complete');
      } catch (error) {
        console.warn('Cleanup script failed (non-fatal):', error);
        progress('cleanup', 30, 'Cleanup skipped (container may not be accessible)');
      }
    }

    // Step 2: Stop container
    progress('stop', 40, 'Stopping staging container...');
    const stopUpid = await this.client.shutdownLxc(vmid, 30);
    await pollTaskUntilComplete(this.client, stopUpid, { timeoutMs: 60000 });

    // Wait for container to fully stop
    for (let i = 0; i < 30; i++) {
      const status = await this.client.getLxcStatus(vmid);
      if (status.status === 'stopped') break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    progress('stop', 60, 'Container stopped');

    // Step 3: Convert to template
    progress('template', 80, 'Converting to template...');
    await this.client.convertToTemplate(vmid);

    progress('complete', 100, 'Template finalized successfully!');
  }

  /**
   * Provision the container with required software via SSH
   * @param skipCleanup - If true, skips the cleanup step (for staging mode)
   * @param onLog - Callback for real-time log output
   */
  private async provisionContainer(
    containerIp: string,
    techStacks: string[] = [],
    onProgress?: (message: string) => void,
    skipCleanup: boolean = false,
    onLog?: LogCallback
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

    // Step 1: Run core provisioning script
    onProgress?.('Running core provisioning...');
    let result = await execSSHCommand(
      { host: containerIp, username: sshUser },
      ['bash', '-c', CORE_PROVISIONING_SCRIPT],
      { workingDir: '/', onOutput: onLog }
    );

    if (result.exitCode !== 0) {
      console.error('Core provisioning stderr:', result.stderr);
      throw new Error(`Core provisioning failed with exit code ${result.exitCode}`);
    }

    // Step 2: Install selected tech stacks
    if (techStacks.length > 0) {
      onProgress?.(`Installing tech stacks: ${techStacks.join(', ')}...`);
      const techStackScript = generateInstallScript(techStacks);

      result = await execSSHCommand(
        { host: containerIp, username: sshUser },
        ['bash', '-c', techStackScript],
        { workingDir: '/', onOutput: onLog }
      );

      if (result.exitCode !== 0) {
        console.error('Tech stack installation stderr:', result.stderr);
        throw new Error(`Tech stack installation failed with exit code ${result.exitCode}`);
      }

      // If Docker was installed, add kobozo to docker group
      if (techStacks.includes('docker')) {
        onProgress?.('Configuring Docker for kobozo user...');
        await execSSHCommand(
          { host: containerIp, username: sshUser },
          ['bash', '-c', 'usermod -aG docker kobozo || true'],
          { workingDir: '/', onOutput: onLog }
        );
      }
    }

    // Skip cleanup if staging mode (user will do manual customization, then cleanup happens on finalize)
    if (skipCleanup) {
      onProgress?.('Provisioning complete (cleanup skipped for staging)');
      return;
    }

    // Cleanup
    onProgress?.('Cleaning up...');
    await execSSHCommand(
      { host: containerIp, username: sshUser },
      ['bash', '-c', CLEANUP_SCRIPT],
      { workingDir: '/', onOutput: onLog }
    );

    onProgress?.('Provisioning complete');
  }

  /**
   * Install only tech stacks (for cloned templates that already have core packages)
   * @param skipCleanup - If true, skips the cleanup step (for staging mode)
   * @param onLog - Callback for real-time log output
   */
  private async provisionTechStacksOnly(
    containerIp: string,
    techStacks: string[] = [],
    onProgress?: (message: string) => void,
    skipCleanup: boolean = false,
    onLog?: LogCallback
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

    // Install selected tech stacks
    if (techStacks.length > 0) {
      onProgress?.(`Installing tech stacks: ${techStacks.join(', ')}...`);
      const techStackScript = generateInstallScript(techStacks);

      const result = await execSSHCommand(
        { host: containerIp, username: sshUser },
        ['bash', '-c', techStackScript],
        { workingDir: '/', onOutput: onLog }
      );

      if (result.exitCode !== 0) {
        console.error('Tech stack installation stderr:', result.stderr);
        throw new Error(`Tech stack installation failed with exit code ${result.exitCode}`);
      }

      // If Docker was installed, add kobozo to docker group
      if (techStacks.includes('docker')) {
        onProgress?.('Configuring Docker for kobozo user...');
        await execSSHCommand(
          { host: containerIp, username: sshUser },
          ['bash', '-c', 'usermod -aG docker kobozo || true'],
          { workingDir: '/', onOutput: onLog }
        );
      }
    }

    // Skip cleanup if staging mode
    if (skipCleanup) {
      onProgress?.('Tech stack installation complete (cleanup skipped for staging)');
      return;
    }

    // Cleanup
    onProgress?.('Cleaning up...');
    await execSSHCommand(
      { host: containerIp, username: sshUser },
      ['bash', '-c', CLEANUP_SCRIPT],
      { workingDir: '/', onOutput: onLog }
    );

    onProgress?.('Tech stack installation complete');
  }

  /**
   * Run cleanup script on a container (used after staging)
   */
  async runCleanup(containerIp: string, onLog?: LogCallback): Promise<void> {
    await execSSHCommand(
      { host: containerIp, username: 'root' },
      ['bash', '-c', CLEANUP_SCRIPT],
      { workingDir: '/', onOutput: onLog }
    );
  }

  /**
   * Delete an existing template (legacy method - also clears old settings)
   */
  async deleteTemplate(vmid: number): Promise<void> {
    await this.deleteProxmoxTemplate(vmid);

    // Clear the settings from database (legacy single-template system)
    const settingsService = getSettingsService();
    await settingsService.clearProxmoxTemplateSettings();
  }

  /**
   * Delete a template from Proxmox only (does not touch database settings)
   * Used by the multi-template system where database records are managed separately
   */
  async deleteProxmoxTemplate(vmid: number): Promise<void> {
    console.log(`Attempting to delete Proxmox template VMID ${vmid}...`);

    // Try to stop the container if it's running
    try {
      const status = await this.client.getLxcStatus(vmid);
      console.log(`Template ${vmid} status: ${status.status}`);
      if (status.status !== 'stopped') {
        console.log(`Stopping template ${vmid}...`);
        const stopUpid = await this.client.stopLxc(vmid);
        await pollTaskUntilComplete(this.client, stopUpid, { timeoutMs: 60000 });
      }
    } catch (error) {
      // Container might not exist or be in a state where it can't be stopped
      console.log(`Could not get/stop template ${vmid} status:`, error);
    }

    // Try to delete the container
    try {
      console.log(`Deleting template ${vmid} from Proxmox...`);
      const deleteUpid = await this.client.deleteLxc(vmid, true);
      await pollTaskUntilComplete(this.client, deleteUpid, { timeoutMs: 60000 });
      console.log(`Successfully deleted template ${vmid} from Proxmox`);
    } catch (error) {
      // If container doesn't exist or is already deleted, that's fine
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isNotFoundError =
        errorMsg.toLowerCase().includes('does not exist') ||
        errorMsg.toLowerCase().includes('not found') ||
        errorMsg.toLowerCase().includes('no such') ||
        errorMsg.includes('500') || // Sometimes Proxmox returns 500 for missing containers
        errorMsg.includes('Configuration file') && errorMsg.includes('does not exist');

      if (isNotFoundError) {
        console.log(`Template ${vmid} not found in Proxmox (already deleted?)`);
      } else {
        // Re-throw other errors
        console.error(`Error deleting template ${vmid}:`, error);
        throw error;
      }
    }
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

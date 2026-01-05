import { config } from '@/lib/config';
import { randomBytes } from 'crypto';
import type { Duplex } from 'stream';
import type {
  IContainerBackend,
  ContainerConfig,
  ContainerInfo,
  ContainerStream,
  ExecResult,
  ContainerBackendType,
} from '../interfaces';
import { getProxmoxClient, ProxmoxClient } from '../proxmox/client';
import { pollTaskUntilComplete, waitForContainerIp, waitForContainerRunning } from '../proxmox/task-poller';
import { createSSHStream, execSSHCommand, syncWorkspaceToContainer, syncWorkspaceFromContainer, syncSSHKeyToContainer, cloneRepoInContainer, setupContainerSSHAccess } from '../proxmox/ssh-stream';
import { getSettingsService } from '@/lib/services/settings-service';
import { generateInstallScript, getTechStacks } from '../proxmox/tech-stacks';

/**
 * Proxmox LXC container backend implementation
 * Manages containers using the Proxmox VE API
 */
export class ProxmoxBackend implements IContainerBackend {
  readonly backendType: ContainerBackendType = 'proxmox';

  private client: ProxmoxClient;
  private containerIps: Map<string, string> = new Map(); // vmid -> IP cache
  private workspacePaths: Map<string, string> = new Map(); // vmid -> local workspace path

  constructor() {
    this.client = getProxmoxClient();
  }

  /**
   * Create a new LXC container for a workspace by cloning from template
   */
  async createContainer(workspaceId: string, containerConfig: ContainerConfig): Promise<string> {
    const cfg = config.proxmox;
    const { workspacePath, env = {}, memoryLimit, cpuLimit, reuseVmid } = containerConfig;
    const settingsService = getSettingsService();

    // Get template VMID from settings (database)
    const templateVmid = await settingsService.getProxmoxTemplateVmid();
    if (!templateVmid) {
      throw new Error('No template configured. Create a template in Settings first.');
    }

    // Use provided VMID if recreating, otherwise allocate next sequential VMID
    const newVmid = reuseVmid ?? await settingsService.allocateWorkspaceVmid();
    console.log(`Creating LXC container ${newVmid} from template ${templateVmid} for workspace ${workspaceId}${reuseVmid ? ' (reusing VMID)' : ''}`);

    // Clone the template
    const upid = await this.client.cloneLxc(templateVmid, newVmid, {
      hostname: `session-hub-${workspaceId.substring(0, 8)}`,
      description: `Session Hub workspace: ${workspaceId}`,
      storage: cfg.storage,
      full: true, // Full clone for isolation
    });

    // Wait for clone to complete
    await pollTaskUntilComplete(this.client, upid, {
      timeoutMs: 120000, // 2 minutes for clone
      onProgress: (status) => {
        console.log(`Clone task status: ${status}`);
      },
    });

    console.log(`LXC container ${newVmid} cloned successfully`);

    // Configure the container resources (skip bind mounts - API tokens can't use them)
    // For workspace files, we'll use rsync/scp after container starts
    const containerConfig2: Record<string, unknown> = {
      onboot: 1, // Start container on host boot
    };

    // Set resources if different from template
    if (memoryLimit) {
      const memMb = this.parseMemoryToMb(memoryLimit);
      containerConfig2.memory = memMb;
    }
    if (cpuLimit) {
      containerConfig2.cores = cpuLimit;
    }

    // Configure network with VLAN tag if specified
    if (cfg.vlanTag) {
      // Format: name=eth0,bridge=vmbr0,tag=2,ip=dhcp
      containerConfig2.net0 = `name=eth0,bridge=${cfg.bridge},tag=${cfg.vlanTag},ip=dhcp`;
      console.log(`Setting network with VLAN tag ${cfg.vlanTag}`);
    }

    // Apply configuration
    try {
      await this.client.setLxcConfig(newVmid, containerConfig2);
    } catch (error) {
      console.warn(`Could not apply container config for ${newVmid}:`, error);
      // Continue anyway - template defaults should work
    }

    // Store workspace path for later syncing
    if (workspacePath) {
      this.workspacePaths.set(String(newVmid), workspacePath);
    }

    // Return VMID as string (container ID)
    return String(newVmid);
  }

  /**
   * Start an LXC container
   */
  async startContainer(containerId: string): Promise<void> {
    const vmid = parseInt(containerId, 10);
    console.log(`Starting LXC container ${vmid}`);

    const upid = await this.client.startLxc(vmid);
    await pollTaskUntilComplete(this.client, upid, { timeoutMs: 60000 });

    // Wait for container to be running
    await waitForContainerRunning(this.client, vmid);

    // Wait for IP and cache it
    try {
      const ip = await waitForContainerIp(this.client, vmid, { timeoutMs: 30000 });
      this.containerIps.set(containerId, ip);
      console.log(`LXC container ${vmid} started with IP: ${ip}`);

      // Setup SSH access to the container via pct exec on Proxmox host
      // This must happen before any SSH-based operations (rsync, agent provisioning)
      const cfg = config.proxmox;
      if (cfg.host) {
        try {
          await setupContainerSSHAccess(cfg.host, vmid);
        } catch (sshError) {
          console.warn(`Could not setup SSH access for container ${vmid}:`, sshError);
          // Non-fatal - SSH might already be configured in template
        }
      }
    } catch (error) {
      console.warn(`Could not determine IP for container ${vmid}:`, error);
    }
  }

  /**
   * Stop an LXC container
   */
  async stopContainer(containerId: string, timeout = 30): Promise<void> {
    const vmid = parseInt(containerId, 10);
    console.log(`Stopping LXC container ${vmid}`);

    try {
      // Try graceful shutdown first
      const upid = await this.client.shutdownLxc(vmid, timeout);
      await pollTaskUntilComplete(this.client, upid, { timeoutMs: (timeout + 10) * 1000 });
    } catch (error) {
      // If shutdown fails, force stop
      console.warn(`Graceful shutdown failed for ${vmid}, forcing stop:`, error);
      const upid = await this.client.stopLxc(vmid, 5);
      await pollTaskUntilComplete(this.client, upid, { timeoutMs: 30000 });
    }

    // Clear cached IP
    this.containerIps.delete(containerId);
    console.log(`LXC container ${vmid} stopped`);
  }

  /**
   * Remove an LXC container
   */
  async removeContainer(containerId: string): Promise<void> {
    const vmid = parseInt(containerId, 10);
    console.log(`Removing LXC container ${vmid}`);

    try {
      // Ensure container is stopped first
      const status = await this.client.getLxcStatus(vmid);
      if (status.status !== 'stopped') {
        await this.stopContainer(containerId);
      }
    } catch {
      // Container might already be gone
    }

    try {
      const upid = await this.client.deleteLxc(vmid, true);
      await pollTaskUntilComplete(this.client, upid, { timeoutMs: 60000 });
      console.log(`LXC container ${vmid} removed`);
    } catch (error) {
      // Container might not exist
      console.warn(`Failed to remove container ${vmid}:`, error);
    }

    // Clear cached IP
    this.containerIps.delete(containerId);
  }

  /**
   * Get container status
   */
  async getContainerInfo(containerId: string): Promise<ContainerInfo | null> {
    const vmid = parseInt(containerId, 10);

    try {
      const status = await this.client.getLxcStatus(vmid);

      // Map Proxmox status to our status
      let containerStatus: ContainerInfo['status'];
      switch (status.status) {
        case 'running':
          containerStatus = 'running';
          break;
        case 'stopped':
          containerStatus = 'exited';
          break;
        default:
          containerStatus = 'created';
      }

      // Try to get IP from cache or fetch it
      let ipAddress = this.containerIps.get(containerId);
      if (!ipAddress && status.status === 'running') {
        try {
          ipAddress = await waitForContainerIp(this.client, vmid, { timeoutMs: 5000 });
          this.containerIps.set(containerId, ipAddress);
        } catch {
          // IP not available yet
        }
      }

      return {
        id: containerId,
        status: containerStatus,
        ipAddress,
      };
    } catch (error) {
      // Container doesn't exist
      return null;
    }
  }

  /**
   * Attach to container (not really applicable for LXC, returns shell)
   */
  async attachToContainer(containerId: string): Promise<ContainerStream> {
    return this.execCommand(containerId, ['/bin/bash']);
  }

  /**
   * Execute an interactive command in the container via SSH
   */
  async execCommand(containerId: string, command?: string[] | null): Promise<ContainerStream> {
    const vmid = parseInt(containerId, 10);
    const cmd = command && command.length > 0 ? command : ['/bin/bash'];

    console.log(`Executing command in LXC ${vmid}:`, cmd);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      // Try to get IP
      ip = await waitForContainerIp(this.client, vmid, { timeoutMs: 10000 });
      this.containerIps.set(containerId, ip);
    }

    // Build environment
    const env: Record<string, string> = {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    if (config.anthropic.apiKey) {
      env.ANTHROPIC_API_KEY = config.anthropic.apiKey;
    }

    // Create SSH stream - use configured SSH user (defaults to kobozo)
    const cfg = config.proxmox;
    const streamResult = await createSSHStream(
      { host: ip, username: cfg.sshUser },
      {
        command: cmd,
        workingDir: '/workspace',
        env,
      }
    );

    return {
      stream: streamResult.stream,
      close: streamResult.close,
      resize: streamResult.resize,
    };
  }

  /**
   * Execute a command and return the result
   */
  async executeCommand(containerId: string, command: string[]): Promise<ExecResult> {
    const vmid = parseInt(containerId, 10);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(this.client, vmid, { timeoutMs: 10000 });
      this.containerIps.set(containerId, ip);
    }

    // Build environment
    const env: Record<string, string> = {};
    if (config.anthropic.apiKey) {
      env.ANTHROPIC_API_KEY = config.anthropic.apiKey;
    }

    // Use configured SSH user (defaults to kobozo)
    const cfg = config.proxmox;
    return execSSHCommand(
      { host: ip, username: cfg.sshUser },
      command,
      { workingDir: '/workspace', env }
    );
  }

  /**
   * Check if the template exists
   */
  async imageExists(): Promise<boolean> {
    const settingsService = getSettingsService();
    const templateVmid = await settingsService.getProxmoxTemplateVmid();
    if (!templateVmid) {
      return false;
    }

    try {
      const status = await this.client.getLxcStatus(templateVmid);
      return !!status;
    } catch {
      return false;
    }
  }

  /**
   * Ensure the template is available
   */
  async ensureImage(): Promise<void> {
    const exists = await this.imageExists();
    if (!exists) {
      throw new Error(
        'No Proxmox LXC template found. Create a template in Settings > Proxmox Template first.'
      );
    }
  }

  /**
   * Get the cached IP for a container
   */
  getCachedIp(containerId: string): string | undefined {
    return this.containerIps.get(containerId);
  }

  /**
   * Sync workspace files to the container
   * This copies the worktree files from the host to the container's /workspace
   */
  async syncWorkspace(
    containerId: string,
    localPath: string,
    remotePath: string = '/workspace',
    options: { branchName?: string; remoteUrl?: string } = {}
  ): Promise<void> {
    const vmid = parseInt(containerId, 10);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(this.client, vmid, { timeoutMs: 30000 });
      this.containerIps.set(containerId, ip);
    }

    console.log(`Syncing workspace to container ${vmid}: ${localPath} -> ${ip}:${remotePath}`);

    try {
      await syncWorkspaceToContainer(localPath, ip, remotePath, { delete: false });
      console.log(`Workspace sync to container ${vmid} completed`);

      // Fix git worktree pointer - convert to standalone repo
      // Worktrees have a .git file pointing to host path, which doesn't work in container
      const { branchName, remoteUrl } = options;
      if (branchName || remoteUrl) {
        console.log(`Converting git worktree to standalone repo in container ${vmid}`);
        const gitSetupScript = `
          cd ${remotePath}
          if [ -f .git ]; then
            # It's a worktree pointer file, need to convert to real repo
            rm -f .git
            git init
            ${remoteUrl ? `git remote add origin "${remoteUrl}"` : ''}
            git add -A
            git commit -m "Initial commit from worktree sync" --allow-empty 2>/dev/null || true
            ${branchName ? `git branch -M "${branchName}"` : ''}
            echo "Git repo initialized"
          elif [ -d .git ]; then
            echo "Already a git repo"
          else
            echo "No .git found, initializing"
            git init
            ${remoteUrl ? `git remote add origin "${remoteUrl}"` : ''}
            git add -A
            git commit -m "Initial commit" --allow-empty 2>/dev/null || true
            ${branchName ? `git branch -M "${branchName}"` : ''}
          fi
        `;
        try {
          // Use configured SSH user for git operations (kobozo owns /workspace)
          const proxmoxCfg = config.proxmox;
          await execSSHCommand({ host: ip, username: proxmoxCfg.sshUser }, ['bash', '-c', gitSetupScript], { workingDir: '/' });
          console.log(`Git repo initialized in container ${vmid}`);
        } catch (gitError) {
          console.warn(`Could not setup git in container ${vmid}:`, gitError);
          // Non-fatal - files are synced, just git won't work
        }
      }
    } catch (error) {
      console.error(`Failed to sync workspace to container ${vmid}:`, error);
      throw error;
    }
  }

  /**
   * Sync workspace files back from the container to host
   * This saves any changes made inside the container back to the worktree
   */
  async syncWorkspaceBack(containerId: string, remotePath: string, localPath: string): Promise<void> {
    const vmid = parseInt(containerId, 10);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(this.client, vmid, { timeoutMs: 10000 });
      this.containerIps.set(containerId, ip);
    }

    console.log(`Syncing workspace back from container ${vmid}: ${ip}:${remotePath} -> ${localPath}`);

    try {
      await syncWorkspaceFromContainer(ip, remotePath, localPath);
      console.log(`Workspace sync back from container ${vmid} completed`);
    } catch (error) {
      console.error(`Failed to sync workspace back from container ${vmid}:`, error);
      throw error;
    }
  }

  /**
   * Get stored workspace path for a container
   */
  getWorkspacePath(containerId: string): string | undefined {
    return this.workspacePaths.get(containerId);
  }

  /**
   * Set workspace path for a container (useful when resuming from DB)
   */
  setWorkspacePath(containerId: string, localPath: string): void {
    this.workspacePaths.set(containerId, localPath);
  }

  /**
   * Sync an SSH key to the container for git operations
   */
  async syncSSHKey(containerId: string, privateKey: string, keyName: string = 'id_ed25519'): Promise<void> {
    const vmid = parseInt(containerId, 10);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(this.client, vmid, { timeoutMs: 30000 });
      this.containerIps.set(containerId, ip);
    }

    await syncSSHKeyToContainer(ip, privateKey, keyName);
  }

  /**
   * Configure container networking (enable DHCP client)
   * Called after container starts to ensure it gets an IP
   */
  async configureNetworking(containerId: string): Promise<void> {
    const vmid = parseInt(containerId, 10);

    // Get container IP (will trigger DHCP if needed)
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(this.client, vmid, { timeoutMs: 90000 });
      this.containerIps.set(containerId, ip);
    }

    console.log(`Container ${vmid} networking configured, IP: ${ip}`);

    // Setup dhclient service for persistent networking via SSH (requires root for systemd)
    try {
      const { execSSHCommand } = await import('../proxmox/ssh-stream');
      await execSSHCommand(
        { host: ip, username: 'root' },
        ['bash', '-c', `
          if [ ! -f /etc/systemd/system/dhclient-eth0.service ]; then
            cat > /etc/systemd/system/dhclient-eth0.service << 'EOF'
[Unit]
Description=DHCP Client for eth0
Wants=network.target
After=network.target

[Service]
Type=oneshot
ExecStart=/sbin/dhclient eth0
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
            systemctl daemon-reload
            systemctl enable dhclient-eth0.service
          fi
        `],
        { workingDir: '/' }
      );
      console.log(`DHCP service configured in container ${vmid}`);
    } catch (error) {
      console.warn(`Could not configure DHCP service in container ${vmid}:`, error);
      // Non-fatal - container should still work
    }
  }

  /**
   * Clone a git repo into the container
   * This is the preferred method for Proxmox containers (instead of rsync)
   */
  async cloneRepo(
    containerId: string,
    repoUrl: string,
    branchName: string,
    sshKeyContent?: string
  ): Promise<void> {
    const vmid = parseInt(containerId, 10);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(this.client, vmid, { timeoutMs: 30000 });
      this.containerIps.set(containerId, ip);
    }

    console.log(`Cloning repo to container ${vmid}: ${repoUrl} (branch: ${branchName})`);

    await cloneRepoInContainer(ip, repoUrl, branchName, '/workspace', {
      sshKeyContent,
    });
  }

  /**
   * Provision the sidecar agent in a container
   * This sets up the agent configuration and downloads the agent bundle
   */
  async provisionAgent(
    containerId: string,
    workspaceId: string,
    agentToken: string
  ): Promise<void> {
    const vmid = parseInt(containerId, 10);
    const cfg = config.proxmox;

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(this.client, vmid, { timeoutMs: 30000 });
      this.containerIps.set(containerId, ip);
    }

    console.log(`Provisioning agent for workspace ${workspaceId} in container ${vmid}`);

    const sessionHubUrl = process.env.SESSION_HUB_URL || `http://localhost:${config.server.port}`;
    const agentBundleUrl = `${sessionHubUrl}/api/agent/bundle`;
    const agentVersion = process.env.AGENT_VERSION || '1.0.0';

    try {
      // 1. Stop the agent service first if it's running (template may have it pre-installed)
      // This ensures the agent doesn't start with stale/missing config
      // Note: All agent provisioning operations use root for system-level access
      try {
        await execSSHCommand(
          { host: ip, username: 'root' },
          ['systemctl', 'stop', 'session-hub-agent'],
          { workingDir: '/' }
        );
        console.log(`Stopped existing agent service in container ${vmid}`);
      } catch {
        // Agent service might not exist yet, that's fine
        console.log(`No existing agent service to stop in container ${vmid}`);
      }

      // 2. Write agent environment configuration
      // The env file needs to be readable by kobozo since the agent service runs as kobozo
      await execSSHCommand(
        { host: ip, username: 'root' },
        ['bash', '-c', `
          cat > /etc/session-hub-agent.env << 'EOF'
SESSION_HUB_URL=${sessionHubUrl}
WORKSPACE_ID=${workspaceId}
AGENT_TOKEN=${agentToken}
AGENT_VERSION=${agentVersion}
EOF
          chown kobozo:kobozo /etc/session-hub-agent.env
          chmod 600 /etc/session-hub-agent.env
        `],
        { workingDir: '/' }
      );
      console.log(`Agent configuration written to container ${vmid}`);

      // 3. Download and install the agent bundle
      // Ensure the agent directory is owned by kobozo since the service runs as kobozo
      await execSSHCommand(
        { host: ip, username: 'root' },
        ['bash', '-c', `
          cd /opt/session-hub-agent

          # Download agent bundle
          echo "Downloading agent bundle from ${agentBundleUrl}..."
          curl -fSL -o agent-bundle.tar.gz "${agentBundleUrl}" || {
            echo "Failed to download agent bundle"
            exit 1
          }

          # Extract bundle
          echo "Extracting agent bundle..."
          tar -xzf agent-bundle.tar.gz
          rm agent-bundle.tar.gz

          # Install dependencies if package.json exists
          if [ -f package.json ]; then
            echo "Installing agent dependencies..."
            npm install --production --ignore-scripts 2>/dev/null || true
          fi

          # Ensure kobozo owns everything in the agent directory
          chown -R kobozo:kobozo /opt/session-hub-agent

          echo "Agent bundle installed"
        `],
        { workingDir: '/opt/session-hub-agent' }
      );
      console.log(`Agent bundle installed in container ${vmid}`);

      // 4. Start the agent service with the correct configuration
      await execSSHCommand(
        { host: ip, username: 'root' },
        ['systemctl', 'start', 'session-hub-agent'],
        { workingDir: '/' }
      );
      console.log(`Agent service started in container ${vmid}`);

    } catch (error) {
      console.error(`Failed to provision agent in container ${vmid}:`, error);
      throw new Error(`Agent provisioning failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate a secure agent token
   */
  generateAgentToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Install tech stacks in a running container
   * Used to install required tech stacks that aren't pre-installed in the template
   */
  async installTechStacks(containerId: string, techStackIds: string[]): Promise<void> {
    if (!techStackIds || techStackIds.length === 0) {
      console.log(`No tech stacks to install for container ${containerId}`);
      return;
    }

    const vmid = parseInt(containerId, 10);
    const stacks = getTechStacks(techStackIds);

    if (stacks.length === 0) {
      console.log(`No valid tech stacks found for IDs: ${techStackIds.join(', ')}`);
      return;
    }

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(this.client, vmid, { timeoutMs: 30000 });
      this.containerIps.set(containerId, ip);
    }

    console.log(`Installing tech stacks in container ${vmid}: ${stacks.map(s => s.name).join(', ')}`);

    // Generate the install script
    const installScript = generateInstallScript(techStackIds);

    try {
      // Run the install script via SSH as root (tech stacks need root privileges)
      await execSSHCommand(
        { host: ip, username: 'root' },
        ['bash', '-c', installScript],
        { workingDir: '/' }
      );
      console.log(`Tech stacks installed successfully in container ${vmid}`);
    } catch (error) {
      console.error(`Failed to install tech stacks in container ${vmid}:`, error);
      throw new Error(`Tech stack installation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse memory limit string to MB
   */
  private parseMemoryToMb(limit: string): number {
    const match = limit.match(/^(\d+)([kmg]?)$/i);
    if (!match) {
      return 2048; // Default 2GB
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'k':
        return Math.ceil(value / 1024);
      case 'm':
        return value;
      case 'g':
        return value * 1024;
      default:
        return Math.ceil(value / (1024 * 1024));
    }
  }
}

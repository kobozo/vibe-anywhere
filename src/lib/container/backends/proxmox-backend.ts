import { config, getProxmoxRuntimeConfig, type ProxmoxRuntimeConfig } from '@/lib/config';
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
import { getProxmoxClientAsync, ProxmoxClient, resetProxmoxClient } from '../proxmox/client';
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

  private client: ProxmoxClient | null = null;
  private containerIps: Map<string, string> = new Map(); // vmid -> IP cache
  private workspacePaths: Map<string, string> = new Map(); // vmid -> local workspace path

  /**
   * Get the Proxmox client (async initialization)
   */
  private async getClient(): Promise<ProxmoxClient> {
    if (!this.client) {
      this.client = await getProxmoxClientAsync();
    }
    return this.client;
  }

  /**
   * Get the runtime config from the client
   */
  private async getRuntimeConfig(): Promise<ProxmoxRuntimeConfig> {
    const client = await this.getClient();
    return client.getRuntimeConfig();
  }

  /**
   * Create a new LXC container for a workspace by cloning from template
   */
  async createContainer(workspaceId: string, containerConfig: ContainerConfig): Promise<string> {
    const client = await this.getClient();
    const cfg = await this.getRuntimeConfig();
    const { workspacePath, env = {}, memoryLimit, cpuLimit, diskSize: configDiskSize, reuseVmid, templateId, staticIp, gateway, tags } = containerConfig;
    const settingsService = getSettingsService();

    // Use provided templateId from containerConfig, or fall back to settings (backwards compatibility)
    const templateVmid = templateId ?? await settingsService.getProxmoxTemplateVmid();
    if (!templateVmid) {
      throw new Error('No template configured. Create and provision a template first.');
    }

    // Use provided VMID if recreating, otherwise allocate next sequential VMID
    const newVmid = reuseVmid ?? await settingsService.allocateWorkspaceVmid();
    console.log(`Creating LXC container ${newVmid} from template ${templateVmid} for workspace ${workspaceId}${reuseVmid ? ' (reusing VMID)' : ''}`);

    // Clone the template
    const upid = await client.cloneLxc(templateVmid, newVmid, {
      hostname: `vibe-anywhere-${workspaceId.substring(0, 8)}`,
      description: `Vibe Anywhere workspace: ${workspaceId}`,
      storage: cfg.storage,
      full: true, // Full clone for isolation
    });

    // Wait for clone to complete
    await pollTaskUntilComplete(client, upid, {
      timeoutMs: 120000, // 2 minutes for clone
      onProgress: (status) => {
        console.log(`Clone task status: ${status}`);
      },
    });

    console.log(`LXC container ${newVmid} cloned successfully`);

    // Resize disk to configured size (use repository override if provided, otherwise global default)
    const proxmoxSettings = await settingsService.getProxmoxSettings();
    const diskSize = configDiskSize ?? proxmoxSettings.defaultDiskSize ?? 50;
    try {
      const resizeUpid = await client.resizeLxcDisk(newVmid, diskSize);
      await pollTaskUntilComplete(client, resizeUpid, {
        timeoutMs: 60000, // 1 minute for resize
        onProgress: (status) => {
          console.log(`Resize task status: ${status}`);
        },
      });
      console.log(`Resized container ${newVmid} disk to ${diskSize}GB`);
    } catch (resizeError) {
      console.warn(`Could not resize disk for ${newVmid}:`, resizeError);
      // Continue anyway - container will use template's disk size
    }

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

    // Configure network: static IP takes precedence, otherwise DHCP
    // Build net0 configuration based on whether static IP is provided
    let net0 = `name=eth0,bridge=${cfg.bridge}`;

    if (staticIp && gateway) {
      // Static IP configuration: ip=CIDR,gw=gateway
      net0 += `,ip=${staticIp},gw=${gateway}`;
      console.log(`Setting static IP: ${staticIp}, gateway: ${gateway}`);
    } else {
      // DHCP configuration
      net0 += `,ip=dhcp`;
    }

    // Add VLAN tag if specified
    if (cfg.vlanTag) {
      net0 += `,tag=${cfg.vlanTag}`;
      console.log(`Setting network with VLAN tag ${cfg.vlanTag}`);
    }

    containerConfig2.net0 = net0;

    // Apply configuration
    try {
      await client.setLxcConfig(newVmid, containerConfig2);
    } catch (error) {
      console.warn(`Could not apply container config for ${newVmid}:`, error);
      // Continue anyway - template defaults should work
    }

    // Merge workspace tags with inherited template tags (clone inherits template tags)
    if (tags) {
      try {
        // Get existing tags from cloned container (inherited from template)
        const currentConfig = await client.getLxcConfig(newVmid);
        const existingTags = currentConfig.tags as string | undefined;

        // Merge: existing template tags + new workspace tags (deduplicated)
        const existingTagSet = new Set(existingTags ? existingTags.split(';').filter(Boolean) : []);
        const newTagSet = new Set(tags.split(';').filter(Boolean));
        const mergedTags = [...new Set([...existingTagSet, ...newTagSet])].join(';');

        await client.setLxcConfig(newVmid, { tags: mergedTags });
        console.log(`Set tags for container ${newVmid}: ${mergedTags}`);
      } catch (tagError) {
        console.warn(`Could not set tags for ${newVmid}:`, tagError);
        // Non-fatal - container will work without tags
      }
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
    const client = await this.getClient();
    const cfg = await this.getRuntimeConfig();
    const vmid = parseInt(containerId, 10);
    console.log(`Starting LXC container ${vmid}`);

    const upid = await client.startLxc(vmid);
    await pollTaskUntilComplete(client, upid, { timeoutMs: 60000 });

    // Wait for container to be running
    await waitForContainerRunning(client, vmid);

    // Wait for IP and cache it
    try {
      const ip = await waitForContainerIp(client, vmid, { timeoutMs: 30000 });
      this.containerIps.set(containerId, ip);
      console.log(`LXC container ${vmid} started with IP: ${ip}`);

      // Setup SSH access to the container via pct exec on Proxmox host
      // This must happen before any SSH-based operations (rsync, agent provisioning)
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
    const client = await this.getClient();
    const vmid = parseInt(containerId, 10);
    console.log(`Stopping LXC container ${vmid}`);

    try {
      // Try graceful shutdown first
      const upid = await client.shutdownLxc(vmid, timeout);
      await pollTaskUntilComplete(client, upid, { timeoutMs: (timeout + 10) * 1000 });
    } catch (error) {
      // If shutdown fails, force stop
      console.warn(`Graceful shutdown failed for ${vmid}, forcing stop:`, error);
      const upid = await client.stopLxc(vmid, 5);
      await pollTaskUntilComplete(client, upid, { timeoutMs: 30000 });
    }

    // Clear cached IP
    this.containerIps.delete(containerId);
    console.log(`LXC container ${vmid} stopped`);
  }

  /**
   * Restart an LXC container (true restart, preserves state)
   */
  async restartContainer(containerId: string, timeout = 30): Promise<void> {
    const vmid = parseInt(containerId, 10);
    console.log(`Restarting LXC container ${vmid}`);

    // Stop the container
    await this.stopContainer(containerId, timeout);

    // Start it back up
    await this.startContainer(containerId);

    console.log(`LXC container ${vmid} restarted`);
  }

  /**
   * Remove an LXC container
   */
  async removeContainer(containerId: string): Promise<void> {
    const client = await this.getClient();
    const vmid = parseInt(containerId, 10);
    console.log(`Removing LXC container ${vmid}`);

    try {
      // Ensure container is stopped first
      const status = await client.getLxcStatus(vmid);
      if (status.status !== 'stopped') {
        await this.stopContainer(containerId);
      }
    } catch {
      // Container might already be gone
    }

    try {
      const upid = await client.deleteLxc(vmid, true);
      await pollTaskUntilComplete(client, upid, { timeoutMs: 60000 });
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
    const client = await this.getClient();
    const vmid = parseInt(containerId, 10);

    try {
      const status = await client.getLxcStatus(vmid);

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
          ipAddress = await waitForContainerIp(client, vmid, { timeoutMs: 5000 });
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
    const client = await this.getClient();
    const cfg = await this.getRuntimeConfig();
    const vmid = parseInt(containerId, 10);
    const cmd = command && command.length > 0 ? command : ['/bin/bash'];

    console.log(`Executing command in LXC ${vmid}:`, cmd);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      // Try to get IP
      ip = await waitForContainerIp(client, vmid, { timeoutMs: 10000 });
      this.containerIps.set(containerId, ip);
    }

    // Build environment
    const env: Record<string, string> = {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    // Create SSH stream - use configured SSH user (defaults to kobozo)
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
    const client = await this.getClient();
    const cfg = await this.getRuntimeConfig();
    const vmid = parseInt(containerId, 10);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(client, vmid, { timeoutMs: 10000 });
      this.containerIps.set(containerId, ip);
    }

    // Use configured SSH user (defaults to kobozo)
    return execSSHCommand(
      { host: ip, username: cfg.sshUser },
      command,
      { workingDir: '/workspace' }
    );
  }

  /**
   * Check if a template exists
   * Note: For Proxmox with the new multi-template system, actual template validation
   * happens in createContainer() with the proper template context from the repository.
   * This method returns true to skip the generic check.
   */
  async imageExists(): Promise<boolean> {
    // Template validation is now done in createContainer with proper context
    // The workspace-service passes the correct templateId based on repository settings
    return true;
  }

  /**
   * Ensure a template is available
   * Note: With the new multi-template system, actual template validation
   * happens in createContainer() where we have the proper template context.
   */
  async ensureImage(): Promise<void> {
    // No-op for Proxmox - template validation happens in createContainer
    // with the correct templateId from repository/user settings
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
    const client = await this.getClient();
    const cfg = await this.getRuntimeConfig();
    const vmid = parseInt(containerId, 10);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(client, vmid, { timeoutMs: 30000 });
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
          await execSSHCommand({ host: ip, username: cfg.sshUser }, ['bash', '-c', gitSetupScript], { workingDir: '/' });
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
    const client = await this.getClient();
    const vmid = parseInt(containerId, 10);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(client, vmid, { timeoutMs: 10000 });
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
    const client = await this.getClient();
    const vmid = parseInt(containerId, 10);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(client, vmid, { timeoutMs: 30000 });
      this.containerIps.set(containerId, ip);
    }

    await syncSSHKeyToContainer(ip, privateKey, keyName);
  }

  /**
   * Configure container networking (enable DHCP client)
   * Called after container starts to ensure it gets an IP
   */
  async configureNetworking(containerId: string): Promise<void> {
    const client = await this.getClient();
    const vmid = parseInt(containerId, 10);

    // Get container IP (will trigger DHCP if needed)
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(client, vmid, { timeoutMs: 90000 });
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
    const client = await this.getClient();
    const vmid = parseInt(containerId, 10);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(client, vmid, { timeoutMs: 30000 });
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
    const client = await this.getClient();
    const vmid = parseInt(containerId, 10);

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(client, vmid, { timeoutMs: 30000 });
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
          ['systemctl', 'stop', 'vibe-anywhere-agent'],
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
          cat > /etc/vibe-anywhere-agent.env << 'EOF'
SESSION_HUB_URL=${sessionHubUrl}
WORKSPACE_ID=${workspaceId}
AGENT_TOKEN=${agentToken}
AGENT_VERSION=${agentVersion}
EOF
          chown kobozo:kobozo /etc/vibe-anywhere-agent.env
          chmod 600 /etc/vibe-anywhere-agent.env
        `],
        { workingDir: '/' }
      );
      console.log(`Agent configuration written to container ${vmid}`);

      // 3. Download and install the agent bundle
      // Ensure the agent directory is owned by kobozo since the service runs as kobozo
      await execSSHCommand(
        { host: ip, username: 'root' },
        ['bash', '-c', `
          cd /opt/vibe-anywhere-agent

          # Download agent bundle
          echo "Downloading agent bundle from ${agentBundleUrl}..."
          curl -fSL -o agent-bundle.tar.gz "${agentBundleUrl}" || {
            echo "ERROR: Failed to download agent bundle from ${agentBundleUrl}"
            exit 1
          }

          # Verify download
          if [ ! -f agent-bundle.tar.gz ] || [ ! -s agent-bundle.tar.gz ]; then
            echo "ERROR: Agent bundle file is missing or empty"
            exit 1
          fi

          # Extract bundle
          echo "Extracting agent bundle..."
          tar -xzf agent-bundle.tar.gz || {
            echo "ERROR: Failed to extract agent bundle"
            exit 1
          }
          rm agent-bundle.tar.gz

          # Verify extraction - check for binary
          if [ ! -f vibe-anywhere-agent ]; then
            echo "ERROR: Agent binary not found after extraction"
            ls -la /opt/vibe-anywhere-agent/
            exit 1
          fi

          # Make binaries executable
          chmod +x vibe-anywhere-agent
          chmod +x vibe-anywhere

          # Ensure kobozo owns everything in the agent directory
          chown -R kobozo:kobozo /opt/vibe-anywhere-agent

          echo "Agent bundle installed successfully"
        `],
        { workingDir: '/opt/vibe-anywhere-agent' }
      );
      console.log(`Agent bundle installed in container ${vmid}`);

      // 4. Start the agent service with the correct configuration
      await execSSHCommand(
        { host: ip, username: 'root' },
        ['systemctl', 'start', 'vibe-anywhere-agent'],
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
   * Inject environment variables into a running container
   * Writes to /etc/profile.d/vibe-anywhere-env.sh for persistence across shell sessions
   */
  async injectEnvVars(containerId: string, envVars: Record<string, string>): Promise<void> {
    if (!envVars || Object.keys(envVars).length === 0) {
      console.log(`No env vars to inject for container ${containerId}`);
      return;
    }

    const client = await this.getClient();
    const vmid = parseInt(containerId, 10);

    // Get container IP from cache or wait for it
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(client, vmid, { timeoutMs: 30000 });
      this.containerIps.set(containerId, ip);
    }

    // Build the env file content
    // Escape values for shell by wrapping in single quotes and escaping any single quotes
    const envLines = Object.entries(envVars).map(([key, value]) => {
      // Escape single quotes in value: replace ' with '\''
      const escapedValue = value.replace(/'/g, "'\\''");
      return `export ${key}='${escapedValue}'`;
    });

    const envContent = `# Vibe Anywhere Environment Variables
# Auto-generated - do not edit manually
${envLines.join('\n')}
`;

    console.log(`Injecting ${Object.keys(envVars).length} env vars into container ${vmid}`);

    try {
      await execSSHCommand(
        { host: ip, username: 'root' },
        ['bash', '-c', `
          cat > /etc/profile.d/vibe-anywhere-env.sh << 'ENVEOF'
${envContent}
ENVEOF
          chmod 644 /etc/profile.d/vibe-anywhere-env.sh
        `],
        { workingDir: '/' }
      );
      console.log(`Environment variables injected into container ${vmid}`);
    } catch (error) {
      console.error(`Failed to inject env vars into container ${vmid}:`, error);
      throw new Error(`Env var injection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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

    const client = await this.getClient();
    const vmid = parseInt(containerId, 10);
    const stacks = getTechStacks(techStackIds);

    if (stacks.length === 0) {
      console.log(`No valid tech stacks found for IDs: ${techStackIds.join(', ')}`);
      return;
    }

    // Get container IP
    let ip = this.containerIps.get(containerId);
    if (!ip) {
      ip = await waitForContainerIp(client, vmid, { timeoutMs: 30000 });
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

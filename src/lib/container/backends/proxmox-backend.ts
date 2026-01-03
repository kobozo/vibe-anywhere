import { config } from '@/lib/config';
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
import { createSSHStream, execSSHCommand } from '../proxmox/ssh-stream';

/**
 * Proxmox LXC container backend implementation
 * Manages containers using the Proxmox VE API
 */
export class ProxmoxBackend implements IContainerBackend {
  readonly backendType: ContainerBackendType = 'proxmox';

  private client: ProxmoxClient;
  private containerIps: Map<string, string> = new Map(); // vmid -> IP cache

  constructor() {
    this.client = getProxmoxClient();
  }

  /**
   * Create a new LXC container for a workspace by cloning from template
   */
  async createContainer(workspaceId: string, containerConfig: ContainerConfig): Promise<string> {
    const cfg = config.proxmox;
    const { workspacePath, env = {}, memoryLimit, cpuLimit } = containerConfig;

    // Use template VMID from config or container config
    const templateVmid = containerConfig.templateId || cfg.templateVmid;
    if (!templateVmid) {
      throw new Error('No template VMID configured. Set PROXMOX_TEMPLATE_VMID or provide templateId.');
    }

    // Get next available VMID
    const newVmid = await this.client.getNextVmid();
    console.log(`Creating LXC container ${newVmid} from template ${templateVmid} for workspace ${workspaceId}`);

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

    // Configure the container with mount points and resources
    const containerConfig2: Record<string, unknown> = {};

    // Mount workspace path
    if (workspacePath) {
      containerConfig2.mp0 = `${workspacePath},mp=/workspace`;
    }

    // Mount Claude config if configured
    if (cfg.claudeConfigPath) {
      containerConfig2.mp1 = `${cfg.claudeConfigPath},mp=/root/.claude`;
    }

    // Set resources if different from template
    if (memoryLimit) {
      const memMb = this.parseMemoryToMb(memoryLimit);
      containerConfig2.memory = memMb;
    }
    if (cpuLimit) {
      containerConfig2.cores = cpuLimit;
    }

    // Apply configuration
    if (Object.keys(containerConfig2).length > 0) {
      await this.client.setLxcConfig(newVmid, containerConfig2);
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

    // Create SSH stream
    const streamResult = await createSSHStream(
      { host: ip },
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

    return execSSHCommand(
      { host: ip },
      command,
      { workingDir: '/workspace', env }
    );
  }

  /**
   * Check if the template exists
   */
  async imageExists(): Promise<boolean> {
    return this.client.templateExists();
  }

  /**
   * Ensure the template is available
   */
  async ensureImage(): Promise<void> {
    const exists = await this.imageExists();
    if (!exists) {
      const templateVmid = config.proxmox.templateVmid;
      throw new Error(
        `Proxmox LXC template ${templateVmid} not found. ` +
        `Create it using 'scripts/setup-proxmox-template.sh ${templateVmid}'`
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

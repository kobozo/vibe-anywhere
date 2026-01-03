import proxmoxApi from 'proxmox-api';
import { config } from '@/lib/config';

export interface ProxmoxNode {
  node: string;
  status: string;
  cpu: number;
  mem: number;
  maxmem: number;
}

export interface ProxmoxLxc {
  vmid: number;
  name: string;
  status: string;
  mem: number;
  maxmem: number;
  cpus: number;
}

export interface ProxmoxNetworkInterface {
  name: string;
  hwaddr?: string;
  'ip-addresses'?: Array<{
    'ip-address': string;
    'ip-address-type': string;
    prefix: number;
  }>;
}

export interface ProxmoxTaskStatus {
  status: 'running' | 'stopped';
  exitstatus?: string;
  node: string;
  type: string;
  upid: string;
}

/**
 * Wrapper for Proxmox API client
 * Provides typed methods for LXC container management
 */
export class ProxmoxClient {
  private proxmox: ReturnType<typeof proxmoxApi>;
  private node: string;

  constructor() {
    const cfg = config.proxmox;

    if (!cfg.host || !cfg.tokenId || !cfg.tokenSecret || !cfg.node) {
      throw new Error(
        'Proxmox configuration incomplete. Required: PROXMOX_HOST, PROXMOX_TOKEN_ID, PROXMOX_TOKEN_SECRET, PROXMOX_NODE'
      );
    }

    // Disable TLS verification for self-signed certs (common in homelabs)
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    this.proxmox = proxmoxApi({
      host: cfg.host,
      port: cfg.port,
      tokenID: cfg.tokenId,
      tokenSecret: cfg.tokenSecret,
    });

    this.node = cfg.node;
  }

  /**
   * Get list of nodes in the cluster
   */
  async getNodes(): Promise<ProxmoxNode[]> {
    return await this.proxmox.nodes.$get();
  }

  /**
   * Get list of LXC containers on the configured node
   */
  async getLxcContainers(): Promise<ProxmoxLxc[]> {
    return await this.proxmox.nodes.$(this.node).lxc.$get();
  }

  /**
   * Get status of a specific LXC container
   */
  async getLxcStatus(vmid: number): Promise<{ status: string; name: string; vmid: number }> {
    const status = await this.proxmox.nodes.$(this.node).lxc.$(vmid).status.current.$get();
    return status;
  }

  /**
   * Clone an LXC container from a template
   */
  async cloneLxc(
    templateVmid: number,
    newVmid: number,
    options: {
      hostname?: string;
      description?: string;
      storage?: string;
      full?: boolean;
    } = {}
  ): Promise<string> {
    const response = await this.proxmox.nodes.$(this.node).lxc.$(templateVmid).clone.$post({
      newid: newVmid,
      hostname: options.hostname,
      description: options.description,
      storage: options.storage || config.proxmox.storage,
      full: options.full ?? true,
    });

    // Returns UPID for async operation
    return response;
  }

  /**
   * Create a new LXC container from a template
   */
  async createLxc(
    vmid: number,
    ostemplate: string,
    options: {
      hostname?: string;
      description?: string;
      storage?: string;
      memory?: number;
      cores?: number;
      net0?: string;
      mp0?: string;  // Mount point for workspace
    } = {}
  ): Promise<string> {
    const cfg = config.proxmox;

    // Build network configuration
    let net0 = options.net0 || `name=eth0,bridge=${cfg.bridge},ip=dhcp`;
    if (cfg.vlanTag) {
      net0 += `,tag=${cfg.vlanTag}`;
    }

    const response = await this.proxmox.nodes.$(this.node).lxc.$post({
      vmid,
      ostemplate,
      hostname: options.hostname,
      description: options.description,
      storage: options.storage || cfg.storage,
      memory: options.memory || cfg.memoryMb,
      cores: options.cores || cfg.cores,
      net0,
      mp0: options.mp0,
      features: 'nesting=1',
      unprivileged: true,
      start: false,
    });

    return response;
  }

  /**
   * Start an LXC container
   */
  async startLxc(vmid: number): Promise<string> {
    return await this.proxmox.nodes.$(this.node).lxc.$(vmid).status.start.$post();
  }

  /**
   * Stop an LXC container
   */
  async stopLxc(vmid: number, timeout = 10): Promise<string> {
    return await this.proxmox.nodes.$(this.node).lxc.$(vmid).status.stop.$post({
      timeout,
    });
  }

  /**
   * Shutdown an LXC container gracefully
   */
  async shutdownLxc(vmid: number, timeout = 30): Promise<string> {
    return await this.proxmox.nodes.$(this.node).lxc.$(vmid).status.shutdown.$post({
      timeout,
    });
  }

  /**
   * Delete an LXC container
   */
  async deleteLxc(vmid: number, purge = true): Promise<string> {
    return await this.proxmox.nodes.$(this.node).lxc.$(vmid).$delete({
      purge,
    });
  }

  /**
   * Get LXC container configuration
   */
  async getLxcConfig(vmid: number): Promise<Record<string, unknown>> {
    return await this.proxmox.nodes.$(this.node).lxc.$(vmid).config.$get();
  }

  /**
   * Update LXC container configuration
   */
  async setLxcConfig(vmid: number, config: Record<string, unknown>): Promise<void> {
    await this.proxmox.nodes.$(this.node).lxc.$(vmid).config.$put(config);
  }

  /**
   * Get network interfaces of an LXC container
   * Requires QEMU guest agent or similar
   */
  async getLxcInterfaces(vmid: number): Promise<ProxmoxNetworkInterface[]> {
    try {
      const result = await this.proxmox.nodes.$(this.node).lxc.$(vmid).interfaces.$get();
      return result || [];
    } catch {
      // Interfaces API may not be available on all containers
      return [];
    }
  }

  /**
   * Get task status
   */
  async getTaskStatus(upid: string): Promise<ProxmoxTaskStatus> {
    return await this.proxmox.nodes.$(this.node).tasks.$(upid).status.$get();
  }

  /**
   * Find the next available VMID in the configured range
   */
  async getNextVmid(): Promise<number> {
    const cfg = config.proxmox;
    const containers = await this.getLxcContainers();
    const usedVmids = new Set(containers.map(c => c.vmid));

    for (let vmid = cfg.vmidRange.min; vmid <= cfg.vmidRange.max; vmid++) {
      if (!usedVmids.has(vmid)) {
        return vmid;
      }
    }

    throw new Error(
      `No available VMIDs in range ${cfg.vmidRange.min}-${cfg.vmidRange.max}`
    );
  }

  /**
   * Check if the template VMID exists
   */
  async templateExists(): Promise<boolean> {
    const templateVmid = config.proxmox.templateVmid;
    if (!templateVmid) return false;

    try {
      await this.getLxcStatus(templateVmid);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the configured node name
   */
  getNodeName(): string {
    return this.node;
  }
}

// Singleton instance
let proxmoxClientInstance: ProxmoxClient | null = null;

export function getProxmoxClient(): ProxmoxClient {
  if (!proxmoxClientInstance) {
    proxmoxClientInstance = new ProxmoxClient();
  }
  return proxmoxClientInstance;
}

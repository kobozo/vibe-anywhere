import proxmoxApi from 'proxmox-api';
import { config, getProxmoxRuntimeConfig, type ProxmoxRuntimeConfig } from '@/lib/config';

export interface ProxmoxNode {
  node: string;
  status?: string;
  cpu?: number;
  mem?: number;
  maxmem?: number;
}

export interface ProxmoxLxc {
  vmid: number;
  name?: string;
  status?: string;
  mem?: number;
  maxmem?: number;
  cpus?: number;
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
  status: string;
  exitstatus?: string;
  node?: string;
  type?: string;
  upid?: string;
}

/**
 * Wrapper for Proxmox API client
 * Provides typed methods for LXC container management
 */
export class ProxmoxClient {
  private proxmox: ReturnType<typeof proxmoxApi>;
  private node: string;
  private runtimeConfig: ProxmoxRuntimeConfig;

  constructor(runtimeConfig: ProxmoxRuntimeConfig) {
    this.runtimeConfig = runtimeConfig;

    if (!runtimeConfig.host || !runtimeConfig.tokenId || !runtimeConfig.tokenSecret || !runtimeConfig.node) {
      throw new Error(
        'Proxmox configuration incomplete. Required: host, tokenId, tokenSecret, node'
      );
    }

    // Disable TLS verification for self-signed certs (common in homelabs)
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    this.proxmox = proxmoxApi({
      host: runtimeConfig.host,
      port: runtimeConfig.port,
      tokenID: runtimeConfig.tokenId,
      tokenSecret: runtimeConfig.tokenSecret,
    });

    this.node = runtimeConfig.node;
  }

  /**
   * Get the runtime config used by this client
   */
  getRuntimeConfig(): ProxmoxRuntimeConfig {
    return this.runtimeConfig;
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
  async getLxcStatus(vmid: number): Promise<{ status: string; name?: string; vmid?: number }> {
    const status = await this.proxmox.nodes.$(this.node).lxc.$(vmid).status.current.$get();
    return status as { status: string; name?: string; vmid?: number };
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
      storage: options.storage || this.runtimeConfig.storage,
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
      tags?: string; // Proxmox tags (semicolon-separated)
    } = {}
  ): Promise<string> {
    const cfg = this.runtimeConfig;

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
      tags: options.tags,
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
  async stopLxc(vmid: number, _timeout = 10): Promise<string> {
    // Note: timeout parameter not supported by this API endpoint
    return await this.proxmox.nodes.$(this.node).lxc.$(vmid).status.stop.$post({});
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
   * Resize an LXC container's root filesystem
   * @param vmid - Container VMID
   * @param sizeGb - New size in GB
   * @returns UPID for the resize task
   */
  async resizeLxcDisk(vmid: number, sizeGb: number): Promise<string> {
    return await this.proxmox.nodes.$(this.node).lxc.$(vmid).resize.$put({
      disk: 'rootfs',
      size: `${sizeGb}G`,
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
    const cfg = this.runtimeConfig;
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
    const templateVmid = this.runtimeConfig.templateVmid;
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

  /**
   * Create a new LXC container with SSH public keys for authentication
   * This is used for creating templates with pre-configured SSH access
   */
  async createLxcWithSSHKeys(
    vmid: number,
    ostemplate: string,
    options: {
      hostname?: string;
      description?: string;
      storage?: string;
      memory?: number;
      cores?: number;
      net0?: string;
      sshPublicKeys: string;
      rootPassword?: string;
      vlanTag?: number;     // Optional VLAN tag override
      features?: string;    // Optional features (e.g., 'nesting=1')
      tags?: string;        // Proxmox tags (semicolon-separated)
    }
  ): Promise<string> {
    const cfg = this.runtimeConfig;

    // Build network configuration
    // Use provided vlanTag, fall back to config
    const vlanTag = options.vlanTag ?? cfg.vlanTag;
    let net0 = options.net0 || `name=eth0,bridge=${cfg.bridge},ip=dhcp`;
    if (vlanTag) {
      net0 += `,tag=${vlanTag}`;
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
      features: options.features || undefined,  // Only set if specified (for Docker nesting)
      unprivileged: true,
      start: false,
      'ssh-public-keys': options.sshPublicKeys,
      password: options.rootPassword,
      tags: options.tags,
    });

    return response;
  }

  /**
   * Convert an LXC container to a template
   * The container must be stopped first
   */
  async convertToTemplate(vmid: number): Promise<void> {
    await this.proxmox.nodes.$(this.node).lxc.$(vmid).template.$post();
  }

  /**
   * List available appliance templates (downloadable from Proxmox repository)
   */
  async listAppliances(): Promise<Array<{
    template: string;
    package: string;
    headline: string;
    description: string;
    os: string;
    section: string;
    version: string;
  }>> {
    try {
      const result = await this.proxmox.nodes.$(this.node).aplinfo.$get();
      // Map the API response to our expected format
      return (result || []).map((item: Record<string, unknown>) => ({
        template: String(item.template || ''),
        package: String(item.package || ''),
        headline: String(item.headline || ''),
        description: String(item.description || ''),
        os: String(item.os || ''),
        section: String(item.section || ''),
        version: String(item.version || ''),
      }));
    } catch (error) {
      console.warn('Failed to list appliances:', error);
      return [];
    }
  }

  /**
   * List all CT templates stored on Proxmox storage
   * Scans all storages on all nodes that support vztmpl content type
   */
  async listStoredCtTemplates(): Promise<Array<{
    volid: string;       // Full volume ID (e.g., "local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst")
    name: string;        // Template filename
    storage: string;     // Storage ID
    node: string;        // Node name
    size: number;        // Size in bytes
    os?: string;         // Detected OS (debian, ubuntu, etc.)
    version?: string;    // Detected version
  }>> {
    const templates: Array<{
      volid: string;
      name: string;
      storage: string;
      node: string;
      size: number;
      os?: string;
      version?: string;
    }> = [];

    try {
      // Get all nodes in the cluster
      const nodes = await this.getNodes();

      for (const nodeInfo of nodes) {
        const nodeName = nodeInfo.node;

        try {
          // List all storages on this node
          const storages = await this.proxmox.nodes.$(nodeName).storage.$get();

          for (const storage of storages) {
            // Check if this storage supports vztmpl content type
            const contentTypes = String(storage.content || '').split(',');
            if (!contentTypes.includes('vztmpl')) {
              continue;
            }

            const storageId = String(storage.storage || '');
            if (!storageId) continue;

            try {
              // List vztmpl content in this storage
              const content = await this.proxmox.nodes.$(nodeName).storage.$(storageId).content.$get({
                content: 'vztmpl',
              });

              for (const item of content || []) {
                const volid = String(item.volid || '');
                const filename = volid.split('/').pop() || volid;

                // Parse OS and version from filename
                // Common formats: debian-12-standard_12.2-1_amd64.tar.zst
                //                 ubuntu-22.04-standard_22.04-1_amd64.tar.zst
                const osMatch = filename.match(/^(debian|ubuntu|centos|alpine|fedora|rocky|alma)/i);
                const versionMatch = filename.match(/-([\d.]+)[-_]/);

                templates.push({
                  volid,
                  name: filename,
                  storage: storageId,
                  node: nodeName,
                  size: Number(item.size || 0),
                  os: osMatch ? osMatch[1].toLowerCase() : undefined,
                  version: versionMatch ? versionMatch[1] : undefined,
                });
              }
            } catch (storageError) {
              // Skip storages we can't read (permission issues, etc.)
              console.warn(`Failed to list content in storage ${storageId} on ${nodeName}:`, storageError);
            }
          }
        } catch (nodeError) {
          // Skip nodes we can't access
          console.warn(`Failed to list storages on node ${nodeName}:`, nodeError);
        }
      }
    } catch (error) {
      console.warn('Failed to list stored CT templates:', error);
    }

    return templates;
  }

  /**
   * Download an appliance template to storage
   * Returns UPID for tracking the download task
   */
  async downloadAppliance(template: string, storage?: string): Promise<string> {
    const storageId = storage || this.runtimeConfig.storage || 'local';
    return await this.proxmox.nodes.$(this.node).aplinfo.$post({
      storage: storageId,
      template,
    });
  }

  /**
   * Check if a specific appliance template exists in storage
   */
  async applianceTemplateExists(templateName: string, storage?: string): Promise<boolean> {
    const storageId = storage || this.runtimeConfig.storage || 'local';
    try {
      // List content in storage looking for vztmpl (container templates)
      const content = await this.proxmox.nodes.$(this.node).storage.$(storageId).content.$get({
        content: 'vztmpl',
      });

      // Check if any template matches the name
      return content.some((item: { volid?: string }) =>
        item.volid?.includes(templateName)
      );
    } catch (error) {
      console.warn(`Failed to check template existence in ${storageId}:`, error);
      return false;
    }
  }

  /**
   * Get the full template path for creating containers
   * Returns format: "storage:vztmpl/template-name.tar.zst"
   */
  async getApplianceTemplatePath(templateName: string, storage?: string): Promise<string | null> {
    const storageId = storage || this.runtimeConfig.storage || 'local';
    try {
      const content = await this.proxmox.nodes.$(this.node).storage.$(storageId).content.$get({
        content: 'vztmpl',
      });

      const template = content.find((item: { volid?: string }) =>
        item.volid?.includes(templateName)
      );

      return template?.volid || null;
    } catch (error) {
      console.warn(`Failed to get template path for ${templateName}:`, error);
      return null;
    }
  }
}

// Singleton instance
let proxmoxClientInstance: ProxmoxClient | null = null;

/**
 * Get or create the Proxmox client singleton (async)
 * Uses runtime config from DB with .env fallback
 */
export async function getProxmoxClientAsync(): Promise<ProxmoxClient> {
  if (!proxmoxClientInstance) {
    const runtimeConfig = await getProxmoxRuntimeConfig();
    proxmoxClientInstance = new ProxmoxClient(runtimeConfig);
  }
  return proxmoxClientInstance;
}

/**
 * @deprecated Use getProxmoxClientAsync() instead
 * Synchronous getter for backwards compatibility - uses .env config only
 */
export function getProxmoxClient(): ProxmoxClient {
  if (!proxmoxClientInstance) {
    // Fall back to static .env config for backwards compatibility
    const staticConfig = config.proxmox;
    proxmoxClientInstance = new ProxmoxClient({
      host: staticConfig.host,
      port: staticConfig.port,
      tokenId: staticConfig.tokenId,
      tokenSecret: staticConfig.tokenSecret,
      node: staticConfig.node,
      storage: staticConfig.storage,
      bridge: staticConfig.bridge,
      vlanTag: staticConfig.vlanTag,
      sshUser: staticConfig.sshUser,
      sshPrivateKeyPath: staticConfig.sshPrivateKeyPath,
      memoryMb: staticConfig.memoryMb,
      cores: staticConfig.cores,
      claudeConfigPath: staticConfig.claudeConfigPath,
      templateVmid: staticConfig.templateVmid,
      vmidRange: staticConfig.vmidRange,
    });
  }
  return proxmoxClientInstance;
}

/**
 * Reset the client singleton (useful for testing or when config changes)
 */
export function resetProxmoxClient(): void {
  proxmoxClientInstance = null;
}

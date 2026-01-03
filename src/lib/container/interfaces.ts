import type { Duplex } from 'stream';

/**
 * Container backend type
 */
export type ContainerBackendType = 'docker' | 'proxmox';

/**
 * Configuration for creating a container
 */
export interface ContainerConfig {
  image?: string;              // Docker image (Docker only)
  templateId?: number;         // LXC template VMID (Proxmox only)
  workspacePath: string;       // Host path to mount as workspace
  env?: Record<string, string>;
  memoryLimit?: string;        // e.g., "2g", "512m"
  cpuLimit?: number;           // CPU cores
}

/**
 * Container status information
 */
export interface ContainerInfo {
  id: string;
  status: 'created' | 'running' | 'paused' | 'exited' | 'dead' | 'removing' | 'none';
  startedAt?: Date;
  exitCode?: number;
  ipAddress?: string;          // Container IP (Proxmox LXC)
}

/**
 * Interactive stream for terminal sessions
 */
export interface ContainerStream {
  stream: Duplex;
  close: () => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
}

/**
 * Result of executing a command (non-interactive)
 */
export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Backend-agnostic container management interface
 * Implemented by DockerBackend and ProxmoxBackend
 */
export interface IContainerBackend {
  /**
   * The backend type identifier
   */
  readonly backendType: ContainerBackendType;

  /**
   * Create a new container for a workspace
   * @returns Container ID (Docker container ID or Proxmox VMID as string)
   */
  createContainer(workspaceId: string, config: ContainerConfig): Promise<string>;

  /**
   * Start a container
   */
  startContainer(containerId: string): Promise<void>;

  /**
   * Stop a container gracefully
   */
  stopContainer(containerId: string, timeout?: number): Promise<void>;

  /**
   * Remove/destroy a container
   */
  removeContainer(containerId: string): Promise<void>;

  /**
   * Get container status and info
   */
  getContainerInfo(containerId: string): Promise<ContainerInfo | null>;

  /**
   * Attach to container's main TTY stream
   */
  attachToContainer(containerId: string): Promise<ContainerStream>;

  /**
   * Execute an interactive command in the container (for terminal tabs)
   * @param command - Command to execute (default: ['/bin/bash'])
   */
  execCommand(containerId: string, command?: string[] | null): Promise<ContainerStream>;

  /**
   * Execute a command and return the result (non-interactive)
   */
  executeCommand(containerId: string, command: string[]): Promise<ExecResult>;

  /**
   * Check if base image/template exists
   */
  imageExists(): Promise<boolean>;

  /**
   * Ensure base image/template is ready
   */
  ensureImage(): Promise<void>;
}

/**
 * Docker-specific configuration
 */
export interface DockerBackendConfig {
  socketPath: string;
  claudeImage: string;
  memoryLimit: string;
  cpuLimit: number;
}

/**
 * Proxmox-specific configuration
 */
export interface ProxmoxBackendConfig {
  host: string;
  port: number;
  tokenId: string;             // e.g., 'root@pam!session-hub'
  tokenSecret: string;
  node: string;                // Proxmox node name
  templateVmid: number;        // Base LXC template VMID
  storage: string;             // Storage for LXC rootfs
  bridge: string;              // Network bridge
  vlanTag?: number;            // VLAN tag for networking
  sshUser: string;             // SSH user for exec (e.g., 'root')
  sshPrivateKeyPath?: string;  // Path to SSH private key
  vmidRange: {
    min: number;
    max: number;
  };
  memoryMb: number;
  cores: number;
  claudeConfigPath?: string;   // Path to host's .claude directory to mount
}

/**
 * Combined backend configuration
 */
export interface BackendConfig {
  type: ContainerBackendType;
  docker?: DockerBackendConfig;
  proxmox?: ProxmoxBackendConfig;
}

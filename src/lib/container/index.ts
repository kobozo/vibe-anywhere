// Container backend abstraction layer
// Provides a unified interface for Proxmox LXC container management

// Interfaces
export type {
  IContainerBackend,
  ContainerBackendType,
  ContainerConfig,
  ContainerInfo,
  ContainerStream,
  ExecResult,
  ProxmoxBackendConfig,
  BackendConfig,
} from './interfaces';

// Factory functions
export {
  getContainerBackend,
  getContainerBackendAsync,
  initializeBackend,
  getContainerService, // Backward compatibility
} from './backend-factory';

// ProxmoxBackend is lazy-loaded via the factory to avoid dependency issues

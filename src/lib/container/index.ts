// Container backend abstraction layer
// Provides a unified interface for Docker and Proxmox LXC container management

// Interfaces
export type {
  IContainerBackend,
  ContainerBackendType,
  ContainerConfig,
  ContainerInfo,
  ContainerStream,
  ExecResult,
  DockerBackendConfig,
  ProxmoxBackendConfig,
  BackendConfig,
} from './interfaces';

// Factory functions
export {
  getContainerBackend,
  getContainerBackendAsync,
  initializeBackend,
  getBackendType,
  getContainerService, // Backward compatibility
} from './backend-factory';

// Backend implementations (for direct access if needed)
export { DockerBackend } from './backends/docker-backend';
// ProxmoxBackend is lazy-loaded via the factory to avoid dependency issues

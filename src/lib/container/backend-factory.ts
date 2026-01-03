import { config } from '@/lib/config';
import type { IContainerBackend, ContainerBackendType } from './interfaces';
import { DockerBackend } from './backends/docker-backend';

// Singleton instances
let dockerBackend: DockerBackend | null = null;
let proxmoxBackend: IContainerBackend | null = null;

/**
 * Get the Docker backend instance
 */
function getDockerBackend(): DockerBackend {
  if (!dockerBackend) {
    dockerBackend = new DockerBackend();
  }
  return dockerBackend;
}

/**
 * Get the Proxmox backend instance
 * Lazy-loaded to avoid import errors when Proxmox is not configured
 */
async function getProxmoxBackendAsync(): Promise<IContainerBackend> {
  if (!proxmoxBackend) {
    // Dynamic import to avoid loading Proxmox dependencies when not needed
    const { ProxmoxBackend } = await import('./backends/proxmox-backend');
    proxmoxBackend = new ProxmoxBackend();
  }
  return proxmoxBackend;
}

/**
 * Get the configured container backend
 * Uses the CONTAINER_BACKEND environment variable to determine which backend to use
 *
 * @returns The container backend instance (Docker or Proxmox)
 */
export function getContainerBackend(): IContainerBackend {
  const backendType = config.container?.backend || 'docker';

  switch (backendType) {
    case 'docker':
      return getDockerBackend();
    case 'proxmox':
      // For synchronous access, we need to ensure Proxmox backend is pre-initialized
      if (!proxmoxBackend) {
        throw new Error(
          'Proxmox backend not initialized. Call initializeBackend() first or use getContainerBackendAsync().'
        );
      }
      return proxmoxBackend;
    default:
      throw new Error(`Unknown container backend: ${backendType}`);
  }
}

/**
 * Get the configured container backend (async version)
 * Use this when you need to initialize the Proxmox backend for the first time
 */
export async function getContainerBackendAsync(): Promise<IContainerBackend> {
  const backendType = config.container?.backend || 'docker';

  switch (backendType) {
    case 'docker':
      return getDockerBackend();
    case 'proxmox':
      return getProxmoxBackendAsync();
    default:
      throw new Error(`Unknown container backend: ${backendType}`);
  }
}

/**
 * Initialize the container backend
 * Should be called at application startup
 */
export async function initializeBackend(): Promise<void> {
  const backendType = config.container?.backend || 'docker';
  console.log(`Initializing container backend: ${backendType}`);

  if (backendType === 'proxmox') {
    await getProxmoxBackendAsync();
    console.log('Proxmox backend initialized');
  } else {
    getDockerBackend();
    console.log('Docker backend initialized');
  }
}

/**
 * Get the current backend type
 */
export function getBackendType(): ContainerBackendType {
  return (config.container?.backend || 'docker') as ContainerBackendType;
}

/**
 * Backward compatibility alias for getContainerBackend
 * @deprecated Use getContainerBackend() instead
 */
export const getContainerService = getContainerBackend;

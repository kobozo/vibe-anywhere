import { config } from '@/lib/config';
import type { IContainerBackend, ContainerBackendType } from './interfaces';
import { DockerBackend } from './backends/docker-backend';

// Use globalThis to share singleton across Next.js API routes and custom server
const globalWithBackends = globalThis as typeof globalThis & {
  __dockerBackend?: DockerBackend;
  __proxmoxBackend?: IContainerBackend;
  __proxmoxInitPromise?: Promise<IContainerBackend>;
};

/**
 * Get the Docker backend instance
 */
function getDockerBackend(): DockerBackend {
  if (!globalWithBackends.__dockerBackend) {
    globalWithBackends.__dockerBackend = new DockerBackend();
  }
  return globalWithBackends.__dockerBackend;
}

/**
 * Get the Proxmox backend instance (async - uses dynamic import to avoid bundling ssh2)
 */
async function getProxmoxBackendAsync(): Promise<IContainerBackend> {
  if (globalWithBackends.__proxmoxBackend) {
    return globalWithBackends.__proxmoxBackend;
  }

  if (!globalWithBackends.__proxmoxInitPromise) {
    globalWithBackends.__proxmoxInitPromise = (async () => {
      const { ProxmoxBackend } = await import('./backends/proxmox-backend');
      globalWithBackends.__proxmoxBackend = new ProxmoxBackend();
      console.log('Proxmox backend initialized');
      return globalWithBackends.__proxmoxBackend;
    })();
  }

  return globalWithBackends.__proxmoxInitPromise;
}

/**
 * Get the configured container backend
 * Uses the CONTAINER_BACKEND environment variable to determine which backend to use
 *
 * For Proxmox backend, auto-initializes if not already initialized.
 *
 * @returns The container backend instance (Docker or Proxmox)
 */
export function getContainerBackend(): IContainerBackend {
  const backendType = config.container?.backend || 'docker';

  switch (backendType) {
    case 'docker':
      return getDockerBackend();
    case 'proxmox':
      // Auto-initialize if not already done
      if (!globalWithBackends.__proxmoxBackend) {
        // Start async initialization
        getProxmoxBackendAsync().catch(console.error);
        throw new Error(
          'Proxmox backend initializing. Please retry in a moment.'
        );
      }
      return globalWithBackends.__proxmoxBackend;
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

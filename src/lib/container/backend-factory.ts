import type { IContainerBackend } from './interfaces';

// Use globalThis to share singleton across Next.js API routes and custom server
const globalWithBackends = globalThis as typeof globalThis & {
  __proxmoxBackend?: IContainerBackend;
  __proxmoxInitPromise?: Promise<IContainerBackend>;
};

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
 * Get the configured container backend (Proxmox only)
 *
 * Auto-initializes if not already initialized.
 *
 * @returns The Proxmox backend instance
 */
export function getContainerBackend(): IContainerBackend {
  // Auto-initialize if not already done
  if (!globalWithBackends.__proxmoxBackend) {
    // Start async initialization
    getProxmoxBackendAsync().catch(console.error);
    throw new Error(
      'Proxmox backend initializing. Please retry in a moment.'
    );
  }
  return globalWithBackends.__proxmoxBackend;
}

/**
 * Get the configured container backend (async version)
 * Use this when you need to initialize the Proxmox backend for the first time
 */
export async function getContainerBackendAsync(): Promise<IContainerBackend> {
  return getProxmoxBackendAsync();
}

/**
 * Initialize the container backend
 * Should be called at application startup
 */
export async function initializeBackend(): Promise<void> {
  console.log('Initializing Proxmox backend');
  await getProxmoxBackendAsync();
  console.log('Proxmox backend initialized');
}

/**
 * Backward compatibility alias for getContainerBackend
 * @deprecated Use getContainerBackend() instead
 */
export const getContainerService = getContainerBackend;

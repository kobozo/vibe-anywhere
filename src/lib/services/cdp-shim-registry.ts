/**
 * CDP Shim Registry Service
 * Tracks CDP shim versions and manages updates
 */

// Expected CDP shim version (containers older than this should update)
const EXPECTED_CDP_SHIM_VERSION = process.env.CDP_SHIM_VERSION || '1.0.0';

class CdpShimRegistry {
  /**
   * Check if a CDP shim version should be updated
   */
  shouldUpdate(currentVersion: string, expectedVersion: string = EXPECTED_CDP_SHIM_VERSION): boolean {
    const current = currentVersion.split('.').map(Number);
    const expected = expectedVersion.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const c = current[i] || 0;
      const e = expected[i] || 0;
      if (e > c) return true;
      if (e < c) return false;
    }

    return false;
  }

  /**
   * Get expected CDP shim version
   */
  getExpectedVersion(): string {
    return EXPECTED_CDP_SHIM_VERSION;
  }

  /**
   * Get CDP shim bundle URL
   */
  getBundleUrl(baseUrl: string): string {
    return `${baseUrl}/api/cdp-shim/bundle`;
  }
}

// Use global storage to ensure singleton works across Next.js module boundaries
declare global {
  // eslint-disable-next-line no-var
  var cdpShimRegistryInstance: CdpShimRegistry | undefined;
}

export function getCdpShimRegistry(): CdpShimRegistry {
  if (!global.cdpShimRegistryInstance) {
    global.cdpShimRegistryInstance = new CdpShimRegistry();
  }
  return global.cdpShimRegistryInstance;
}

export { CdpShimRegistry };

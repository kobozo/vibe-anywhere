/**
 * Network configuration types and validation utilities
 * Used for static IP configuration in workspaces
 */

/**
 * Network configuration for static IP assignment
 */
export interface NetworkConfig {
  /** IP address in CIDR notation (e.g., 192.168.3.50/24) */
  ipAddress: string;
  /** Gateway IP address (e.g., 192.168.3.1) */
  gateway: string;
}

/**
 * Validation result for network configuration
 */
export interface NetworkConfigValidation {
  isValid: boolean;
  ipAddressError?: string;
  gatewayError?: string;
}

// CIDR notation regex: IP/prefix (e.g., 192.168.3.50/24)
export const CIDR_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:[0-9]|[1-2][0-9]|3[0-2])$/;

// Standard IP address regex
export const IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

/**
 * Validate a CIDR notation IP address (e.g., 192.168.3.50/24)
 */
export function validateCIDR(cidr: string): boolean {
  return CIDR_REGEX.test(cidr);
}

/**
 * Validate a standard IP address (e.g., 192.168.3.1)
 */
export function validateIP(ip: string): boolean {
  return IP_REGEX.test(ip);
}

/**
 * Parse CIDR notation to extract IP and prefix
 */
export function parseCIDR(cidr: string): { ip: string; prefix: number } | null {
  if (!validateCIDR(cidr)) return null;
  const [ip, prefixStr] = cidr.split('/');
  return { ip, prefix: parseInt(prefixStr, 10) };
}

/**
 * Validate complete network configuration
 */
export function validateNetworkConfig(config: Partial<NetworkConfig>): NetworkConfigValidation {
  const result: NetworkConfigValidation = { isValid: true };

  // If both fields are empty, it's valid (means use DHCP)
  if (!config.ipAddress && !config.gateway) {
    return result;
  }

  // Validate IP address (CIDR notation)
  if (config.ipAddress) {
    if (!validateCIDR(config.ipAddress)) {
      result.isValid = false;
      result.ipAddressError = 'Invalid CIDR notation. Use format: 192.168.3.50/24';
    }
  } else if (config.gateway) {
    // Gateway provided without IP
    result.isValid = false;
    result.ipAddressError = 'IP address is required when gateway is specified';
  }

  // Validate gateway
  if (config.gateway) {
    if (!validateIP(config.gateway)) {
      result.isValid = false;
      result.gatewayError = 'Invalid gateway IP address';
    }
  } else if (config.ipAddress) {
    // IP provided without gateway
    result.isValid = false;
    result.gatewayError = 'Gateway is required when using static IP';
  }

  return result;
}

/**
 * Check if network config has static IP configuration
 */
export function hasStaticIp(config: Partial<NetworkConfig>): boolean {
  return Boolean(config.ipAddress && config.gateway);
}

/**
 * Convert NetworkConfig to Proxmox net0 format
 * Returns the ip and gw parts for net0 configuration
 */
export function toProxmoxNetConfig(config: NetworkConfig): { ip: string; gw: string } {
  return {
    ip: config.ipAddress,
    gw: config.gateway,
  };
}

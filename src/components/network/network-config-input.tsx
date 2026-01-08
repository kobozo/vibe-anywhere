'use client';

import { useState, useEffect, useCallback } from 'react';
import { validateCIDR, validateIP, type NetworkConfigValidation } from '@/lib/types/network-config';

export interface NetworkConfigValue {
  ipAddress: string;
  gateway: string;
}

interface NetworkConfigInputProps {
  value: NetworkConfigValue;
  onChange: (value: NetworkConfigValue) => void;
  disabled?: boolean;
}

/**
 * Reusable component for static IP configuration
 * Validates CIDR notation for IP and standard format for gateway
 */
export function NetworkConfigInput({
  value,
  onChange,
  disabled = false,
}: NetworkConfigInputProps) {
  const [ipError, setIpError] = useState<string | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ ip: false, gateway: false });

  // Validate on blur or when both fields have values
  const validate = useCallback((ip: string, gateway: string, force = false): NetworkConfigValidation => {
    const result: NetworkConfigValidation = { isValid: true };

    // Only validate if field has been touched or force is true
    if ((touched.ip || force) && ip) {
      if (!validateCIDR(ip)) {
        result.isValid = false;
        result.ipAddressError = 'Invalid format. Use CIDR notation (e.g., 192.168.3.50/24)';
      }
    }

    if ((touched.gateway || force) && gateway) {
      if (!validateIP(gateway)) {
        result.isValid = false;
        result.gatewayError = 'Invalid IP address format';
      }
    }

    // Cross-field validation: if one is set, the other must be too
    if (ip && !gateway && touched.ip) {
      result.isValid = false;
      result.gatewayError = 'Gateway is required when using static IP';
    }
    if (gateway && !ip && touched.gateway) {
      result.isValid = false;
      result.ipAddressError = 'IP address is required when gateway is specified';
    }

    return result;
  }, [touched]);

  // Update errors when values change
  useEffect(() => {
    const result = validate(value.ipAddress, value.gateway);
    setIpError(result.ipAddressError || null);
    setGatewayError(result.gatewayError || null);
  }, [value.ipAddress, value.gateway, validate]);

  const handleIpChange = (newIp: string) => {
    onChange({ ...value, ipAddress: newIp });
  };

  const handleGatewayChange = (newGateway: string) => {
    onChange({ ...value, gateway: newGateway });
  };

  const handleIpBlur = () => {
    setTouched(t => ({ ...t, ip: true }));
  };

  const handleGatewayBlur = () => {
    setTouched(t => ({ ...t, gateway: true }));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        {/* Static IP (CIDR) */}
        <div>
          <label className="block text-sm text-foreground mb-1">
            Static IP (CIDR)
          </label>
          <input
            type="text"
            value={value.ipAddress}
            onChange={(e) => handleIpChange(e.target.value)}
            onBlur={handleIpBlur}
            placeholder="192.168.3.50/24"
            disabled={disabled}
            className={`w-full px-3 py-2 bg-background-tertiary border rounded text-foreground placeholder-foreground-tertiary transition-colors
              ${ipError ? 'border-error' : 'border-border-secondary'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'focus:outline-none focus:border-primary'}`}
          />
          {ipError && touched.ip && (
            <p className="text-xs text-error mt-1">{ipError}</p>
          )}
          <p className="text-xs text-foreground-tertiary mt-1">
            Format: IP/prefix (e.g., 192.168.3.50/24)
          </p>
        </div>

        {/* Gateway */}
        <div>
          <label className="block text-sm text-foreground mb-1">
            Gateway
          </label>
          <input
            type="text"
            value={value.gateway}
            onChange={(e) => handleGatewayChange(e.target.value)}
            onBlur={handleGatewayBlur}
            placeholder="192.168.3.1"
            disabled={disabled || !value.ipAddress}
            className={`w-full px-3 py-2 bg-background-tertiary border rounded text-foreground placeholder-foreground-tertiary transition-colors
              ${gatewayError ? 'border-error' : 'border-border-secondary'}
              ${disabled || !value.ipAddress ? 'opacity-50 cursor-not-allowed' : 'focus:outline-none focus:border-primary'}`}
          />
          {gatewayError && touched.gateway && (
            <p className="text-xs text-error mt-1">{gatewayError}</p>
          )}
          <p className="text-xs text-foreground-tertiary mt-1">
            Required when using static IP
          </p>
        </div>
      </div>

      {/* Clear button when values are set */}
      {(value.ipAddress || value.gateway) && (
        <button
          type="button"
          onClick={() => {
            onChange({ ipAddress: '', gateway: '' });
            setTouched({ ip: false, gateway: false });
          }}
          disabled={disabled}
          className="text-xs text-foreground-secondary hover:text-foreground transition-colors"
        >
          Clear static IP (use DHCP)
        </button>
      )}
    </div>
  );
}

/**
 * Check if network config is valid for submission
 * Both fields must be empty (DHCP) or both must be valid (static IP)
 */
export function isNetworkConfigValid(value: NetworkConfigValue): boolean {
  // Both empty = valid (use DHCP)
  if (!value.ipAddress && !value.gateway) {
    return true;
  }

  // Both must be set and valid
  if (!value.ipAddress || !value.gateway) {
    return false;
  }

  return validateCIDR(value.ipAddress) && validateIP(value.gateway);
}

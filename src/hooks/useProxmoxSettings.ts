'use client';

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

/**
 * Settings response structure from the API
 */
export interface ProxmoxSettingsData {
  connection: {
    isConfigured: boolean;
    host?: string;
    port?: number;
    tokenId?: string;
    node?: string;
  };
  network: {
    bridge?: string;
    vlanTag?: number;
  };
  resources: {
    defaultStorage?: string;
    defaultMemory?: number;
    defaultCpuCores?: number;
    defaultDiskSize?: number;
  };
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean;
  message?: string;
  version?: string;
  node?: string;
  nodeStatus?: string;
  error?: string;
}

export function useProxmoxSettings() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<ProxmoxSettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch current settings from DB
   */
  const fetchSettings = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/proxmox/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Proxmox settings');
      }

      const { data } = await response.json();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  /**
   * Test connection with provided credentials
   */
  const testConnection = useCallback(
    async (connectionParams: {
      host: string;
      port?: number;
      tokenId: string;
      tokenSecret: string;
      node: string;
    }): Promise<ConnectionTestResult> => {
      if (!token) throw new Error('Not authenticated');

      setIsTesting(true);
      setError(null);

      try {
        const response = await fetch('/api/proxmox/connection/test', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(connectionParams),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            success: false,
            error: result.error?.message || 'Connection failed',
          };
        }

        return {
          success: true,
          message: result.data?.message,
          version: result.data?.version,
          node: result.data?.node,
          nodeStatus: result.data?.nodeStatus,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      } finally {
        setIsTesting(false);
      }
    },
    [token]
  );

  /**
   * Save connection settings
   */
  const saveConnectionSettings = useCallback(
    async (connectionParams: {
      host: string;
      port?: number;
      tokenId: string;
      tokenSecret: string;
      node: string;
    }) => {
      if (!token) throw new Error('Not authenticated');

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/proxmox/settings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ connection: connectionParams }),
        });

        if (!response.ok) {
          const { error } = await response.json();
          throw new Error(error?.message || 'Failed to save connection settings');
        }

        // Refresh settings
        await fetchSettings();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [token, fetchSettings]
  );

  /**
   * Save network settings
   */
  const saveNetworkSettings = useCallback(
    async (networkParams: { bridge?: string; vlanTag?: number | null }) => {
      if (!token) throw new Error('Not authenticated');

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/proxmox/settings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ network: networkParams }),
        });

        if (!response.ok) {
          const { error } = await response.json();
          throw new Error(error?.message || 'Failed to save network settings');
        }

        await fetchSettings();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [token, fetchSettings]
  );

  /**
   * Save resource settings
   */
  const saveResourceSettings = useCallback(
    async (resourceParams: {
      defaultStorage?: string | null;
      defaultMemory?: number | null;
      defaultCpuCores?: number | null;
    }) => {
      if (!token) throw new Error('Not authenticated');

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/proxmox/settings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ resources: resourceParams }),
        });

        if (!response.ok) {
          const { error } = await response.json();
          throw new Error(error?.message || 'Failed to save resource settings');
        }

        await fetchSettings();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [token, fetchSettings]
  );

  /**
   * Clear connection settings
   */
  const removeConnectionSettings = useCallback(async () => {
    if (!token) throw new Error('Not authenticated');

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/proxmox/settings', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to remove connection settings');
      }

      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [token, fetchSettings]);

  return {
    settings,
    isLoading,
    isTesting,
    error,
    isConnectionConfigured: settings?.connection?.isConfigured ?? false,
    fetchSettings,
    testConnection,
    saveConnectionSettings,
    saveNetworkSettings,
    saveResourceSettings,
    removeConnectionSettings,
  };
}

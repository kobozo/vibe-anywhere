'use client';

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

export function useTailscaleSettings() {
  const { token } = useAuth();
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tailscale/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Tailscale settings');
      }

      const { data } = await response.json();
      setIsConfigured(data.isConfigured);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const testConnection = useCallback(
    async (oauthToken: string) => {
      if (!token) throw new Error('Not authenticated');

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/tailscale/connection/test', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ oauthToken }),
        });

        if (!response.ok) {
          const { error } = await response.json();
          throw new Error(error?.message || 'Failed to test connection');
        }

        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  const saveOAuthToken = useCallback(
    async (oauthToken: string) => {
      if (!token) throw new Error('Not authenticated');

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/tailscale/settings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ oauthToken }),
        });

        if (!response.ok) {
          const { error } = await response.json();
          throw new Error(error?.message || 'Failed to save OAuth token');
        }

        setIsConfigured(true);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  const removeOAuthToken = useCallback(async () => {
    if (!token) throw new Error('Not authenticated');

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tailscale/settings', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to remove OAuth token');
      }

      setIsConfigured(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  return {
    isConfigured,
    isLoading,
    error,
    fetchSettings,
    testConnection,
    saveOAuthToken,
    removeOAuthToken,
  };
}

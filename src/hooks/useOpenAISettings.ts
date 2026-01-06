'use client';

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

export function useOpenAISettings() {
  const { token } = useAuth();
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/openai/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch OpenAI settings');
      }

      const { data } = await response.json();
      setIsConfigured(data.isConfigured);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const saveApiKey = useCallback(
    async (apiKey: string) => {
      if (!token) throw new Error('Not authenticated');

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/openai/settings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ apiKey }),
        });

        if (!response.ok) {
          const { error } = await response.json();
          throw new Error(error?.message || 'Failed to save API key');
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

  const removeApiKey = useCallback(async () => {
    if (!token) throw new Error('Not authenticated');

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/openai/settings', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to remove API key');
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
    saveApiKey,
    removeApiKey,
  };
}

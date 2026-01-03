'use client';

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { SessionInfo, CreateSessionInput } from '@/types/session';

interface UseSessionsReturn {
  sessions: SessionInfo[];
  isLoading: boolean;
  error: Error | null;
  fetchSessions: () => Promise<void>;
  createSession: (input: CreateSessionInput) => Promise<SessionInfo>;
  startSession: (sessionId: string) => Promise<SessionInfo>;
  deleteSession: (sessionId: string) => Promise<void>;
  refreshSession: (sessionId: string) => Promise<SessionInfo>;
}

export function useSessions(): UseSessionsReturn {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const apiRequest = useCallback(
    async <T>(path: string, options: RequestInit = {}): Promise<T> => {
      const response = await fetch(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Request failed');
      }

      return data.data;
    },
    [token]
  );

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ sessions: SessionInfo[] }>('/api/sessions');
      setSessions(data.sessions);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch sessions'));
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest]);

  const createSession = useCallback(
    async (input: CreateSessionInput): Promise<SessionInfo> => {
      const data = await apiRequest<{ session: SessionInfo }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(input),
      });

      setSessions((prev) => [data.session, ...prev]);
      return data.session;
    },
    [apiRequest]
  );

  const startSession = useCallback(
    async (sessionId: string): Promise<SessionInfo> => {
      const data = await apiRequest<{ session: SessionInfo }>(`/api/sessions/${sessionId}`, {
        method: 'POST',
      });

      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? data.session : s))
      );
      return data.session;
    },
    [apiRequest]
  );

  const deleteSession = useCallback(
    async (sessionId: string): Promise<void> => {
      await apiRequest(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    },
    [apiRequest]
  );

  const refreshSession = useCallback(
    async (sessionId: string): Promise<SessionInfo> => {
      const data = await apiRequest<{ session: SessionInfo }>(`/api/sessions/${sessionId}`);

      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? data.session : s))
      );
      return data.session;
    },
    [apiRequest]
  );

  return {
    sessions,
    isLoading,
    error,
    fetchSessions,
    createSession,
    startSession,
    deleteSession,
    refreshSession,
  };
}

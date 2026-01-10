'use client';

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { Tab, TabType } from '@/lib/db/schema';

export interface TabInfo {
  id: string;
  workspaceId: string;
  name: string;
  status: string;
  tabType: TabType;
  icon: string | null;
  isPinned: boolean;
  sortOrder: number;
  command: string[];
  exitOnClose: boolean;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
}

export function useTabs(workspaceId: string | null) {
  const { token } = useAuth();
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTabs = useCallback(async () => {
    if (!token || !workspaceId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tabs`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tabs');
      }

      const { data } = await response.json();
      setTabs(data.tabs);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [token, workspaceId]);

  const createTab = useCallback(
    async (
      name: string,
      templateId?: string | null,
      args?: string[],
      autoShutdownMinutes?: number,
      tabType?: TabType
    ) => {
      if (!token || !workspaceId) throw new Error('Not authenticated or no workspace selected');

      const response = await fetch(`/api/workspaces/${workspaceId}/tabs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          templateId: templateId || undefined,
          args,
          autoShutdownMinutes,
          tabType,
        }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to create tab');
      }

      const { data } = await response.json();
      setTabs((prev) => [...prev, data.tab]);
      return data.tab as TabInfo;
    },
    [token, workspaceId]
  );

  const startTab = useCallback(
    async (tabId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/tabs/${tabId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to start tab');
      }

      const { data } = await response.json();
      setTabs((prev) => prev.map((t) => (t.id === tabId ? data.tab : t)));
      return data.tab as TabInfo;
    },
    [token]
  );

  const deleteTab = useCallback(
    async (tabId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/tabs/${tabId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete tab');
      }

      setTabs((prev) => prev.filter((t) => t.id !== tabId));
    },
    [token]
  );

  const duplicateTab = useCallback(
    async (tab: TabInfo) => {
      if (!token || !workspaceId) throw new Error('Not authenticated or no workspace selected');

      // Create a new tab with the same command and icon
      const response = await fetch(`/api/workspaces/${workspaceId}/tabs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `${tab.name} (copy)`,
          command: tab.command,
          exitOnClose: tab.exitOnClose,
          icon: tab.icon,
        }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to duplicate tab');
      }

      const { data } = await response.json();
      setTabs((prev) => [...prev, data.tab]);
      return data.tab as TabInfo;
    },
    [token, workspaceId]
  );

  const prepareAttach = useCallback(
    async (tabId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/tabs/${tabId}/attach`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to prepare attachment');
      }

      const { data } = await response.json();
      return data;
    },
    [token]
  );

  return {
    tabs,
    isLoading,
    error,
    fetchTabs,
    createTab,
    startTab,
    deleteTab,
    duplicateTab,
    prepareAttach,
    setTabs,
  };
}

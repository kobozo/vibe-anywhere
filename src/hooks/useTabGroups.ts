'use client';

import { useState, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import type { TabGroupLayout } from '@/lib/db/schema';
import type { TabInfo } from './useTabs';

export interface TabGroupMemberInfo {
  id: string;
  groupId: string;
  tabId: string;
  paneIndex: number;
  sizePercent: number;
  createdAt: number;
  tab: TabInfo;
}

export interface TabGroupInfo {
  id: string;
  workspaceId: string;
  name: string;
  layout: TabGroupLayout;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  members: TabGroupMemberInfo[];
}

export interface UpdatePaneSizeInput {
  tabId: string;
  sizePercent: number;
}

export function useTabGroups(workspaceId: string | null) {
  const { token } = useAuth();
  const [groups, setGroups] = useState<TabGroupInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Multi-select state
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());

  // Active group state
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Get active group object
  const activeGroup = useMemo(() => {
    if (!activeGroupId) return null;
    return groups.find(g => g.id === activeGroupId) || null;
  }, [activeGroupId, groups]);

  // Fetch all groups for the workspace
  const fetchGroups = useCallback(async () => {
    if (!token || !workspaceId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tab-groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tab groups');
      }

      const { data } = await response.json();
      setGroups(data.groups);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [token, workspaceId]);

  // Create a new group
  const createGroup = useCallback(
    async (name: string, tabIds: string[], layout?: TabGroupLayout) => {
      if (!token || !workspaceId) throw new Error('Not authenticated or no workspace selected');

      const response = await fetch(`/api/workspaces/${workspaceId}/tab-groups`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, tabIds, layout }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to create tab group');
      }

      const { data } = await response.json();
      setGroups(prev => [...prev, data.group]);

      // Exit multi-select mode and activate the new group
      setMultiSelectMode(false);
      setSelectedTabIds(new Set());
      setActiveGroupId(data.group.id);

      return data.group as TabGroupInfo;
    },
    [token, workspaceId]
  );

  // Update a group (name or layout)
  const updateGroup = useCallback(
    async (groupId: string, updates: { name?: string; layout?: TabGroupLayout }) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/tab-groups/${groupId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to update tab group');
      }

      const { data } = await response.json();
      setGroups(prev => prev.map(g => (g.id === groupId ? data.group : g)));

      return data.group as TabGroupInfo;
    },
    [token]
  );

  // Delete a group (tabs preserved)
  const deleteGroup = useCallback(
    async (groupId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/tab-groups/${groupId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete tab group');
      }

      setGroups(prev => prev.filter(g => g.id !== groupId));

      // If this was the active group, clear it
      if (activeGroupId === groupId) {
        setActiveGroupId(null);
      }
    },
    [token, activeGroupId]
  );

  // Close a group and delete all its tabs
  const closeGroup = useCallback(
    async (groupId: string, deleteTab: (tabId: string) => Promise<void>) => {
      const group = groups.find(g => g.id === groupId);
      if (!group) throw new Error('Group not found');

      // Get all tab IDs in the group
      const tabIds = group.members.map(m => m.tabId);

      // Clear active group first to avoid UI issues during deletion
      if (activeGroupId === groupId) {
        setActiveGroupId(null);
      }

      // Delete all tabs in parallel
      await Promise.all(tabIds.map(tabId => deleteTab(tabId)));

      // Remove the group from state (it should be auto-deleted when all tabs are removed,
      // but we also remove it locally to ensure UI is updated)
      setGroups(prev => prev.filter(g => g.id !== groupId));
    },
    [groups, activeGroupId]
  );

  // Add a tab to an existing group
  const addTabToGroup = useCallback(
    async (groupId: string, tabId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/tab-groups/${groupId}/members`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tabId }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to add tab to group');
      }

      const { data } = await response.json();
      setGroups(prev => prev.map(g => (g.id === groupId ? data.group : g)));

      return data.group as TabGroupInfo;
    },
    [token]
  );

  // Update pane sizes
  const updatePaneSizes = useCallback(
    async (groupId: string, sizes: UpdatePaneSizeInput[]) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/tab-groups/${groupId}/members`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sizes }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to update pane sizes');
      }

      const { data } = await response.json();
      setGroups(prev => prev.map(g => (g.id === groupId ? data.group : g)));

      return data.group as TabGroupInfo;
    },
    [token]
  );

  // Multi-select mode controls
  const enterMultiSelectMode = useCallback(() => {
    setMultiSelectMode(true);
    setSelectedTabIds(new Set());
  }, []);

  const exitMultiSelectMode = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedTabIds(new Set());
  }, []);

  const toggleTabSelection = useCallback((tabId: string) => {
    setSelectedTabIds(prev => {
      const next = new Set(prev);
      if (next.has(tabId)) {
        next.delete(tabId);
      } else {
        // Limit to 4 selections
        if (next.size < 4) {
          next.add(tabId);
        }
      }
      return next;
    });
  }, []);

  const selectAllTabs = useCallback((tabIds: string[]) => {
    // Select up to 4 tabs
    setSelectedTabIds(new Set(tabIds.slice(0, 4)));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTabIds(new Set());
  }, []);

  // Utility: Check if a tab is in any group
  const isTabInGroup = useCallback(
    (tabId: string): string | null => {
      for (const group of groups) {
        if (group.members.some(m => m.tabId === tabId)) {
          return group.id;
        }
      }
      return null;
    },
    [groups]
  );

  // Utility: Get group containing a specific tab
  const getGroupForTab = useCallback(
    (tabId: string): TabGroupInfo | null => {
      return groups.find(g => g.members.some(m => m.tabId === tabId)) || null;
    },
    [groups]
  );

  // Get tab IDs that are in groups (for filtering in tab bar)
  const groupedTabIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      for (const member of group.members) {
        ids.add(member.tabId);
      }
    }
    return ids;
  }, [groups]);

  return {
    // Data
    groups,
    isLoading,
    error,

    // Active group
    activeGroupId,
    activeGroup,
    setActiveGroupId,

    // Multi-select mode
    multiSelectMode,
    selectedTabIds,
    enterMultiSelectMode,
    exitMultiSelectMode,
    toggleTabSelection,
    selectAllTabs,
    clearSelection,

    // CRUD
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    closeGroup,
    updatePaneSizes,
    addTabToGroup,

    // Utilities
    isTabInGroup,
    getGroupForTab,
    groupedTabIds,

    // Direct state setters for external updates
    setGroups,
  };
}

'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useAuth } from './useAuth';
import type { TabInfo } from './useTabs';
import type { TabGroupInfo } from './useTabGroups';

export interface SortOrderUpdate {
  id: string;
  sortOrder: number;
}

// Unified item type for combined tab/group list
export interface SortableItem {
  id: string;
  sortOrder: number;
  type: 'tab' | 'group';
  originalId: string;
}

export interface UseTabReorderingProps {
  workspaceId: string | null;
  tabs: TabInfo[];
  groups: TabGroupInfo[];
  onTabsUpdate: (tabs: TabInfo[]) => void;
  onGroupsUpdate: (groups: TabGroupInfo[]) => void;
  onRefetch?: () => void;
}

export interface UseTabReorderingReturn {
  sensors: ReturnType<typeof useSensors>;
  handleDragEnd: (event: DragEndEvent) => void;
  sortableItems: SortableItem[];
  isReordering: boolean;
}

/**
 * Tab-specific drag-and-drop reordering hook
 * Combines tabs and groups into a unified sortable list
 * Persists changes to the API with optimistic updates
 */
export function useTabReordering({
  workspaceId,
  tabs,
  groups,
  onTabsUpdate,
  onGroupsUpdate,
  onRefetch,
}: UseTabReorderingProps): UseTabReorderingReturn {
  const { token } = useAuth();
  const [isReordering, setIsReordering] = useState(false);

  // Combine tabs and groups into unified sortable items
  // Filter out special tabs (sortOrder < 0) - they're not draggable
  const sortableItems = useMemo(() => {
    const items: SortableItem[] = [];

    // Add groups (always draggable, no special groups with negative sortOrder)
    for (const group of groups) {
      items.push({
        id: `group-${group.id}`,
        sortOrder: group.sortOrder,
        type: 'group',
        originalId: group.id,
      });
    }

    // Add draggable tabs (exclude only Dashboard which has tabType 'dashboard')
    for (const tab of tabs) {
      if (tab.tabType !== 'dashboard') {
        items.push({
          id: `tab-${tab.id}`,
          sortOrder: tab.sortOrder,
          type: 'tab',
          originalId: tab.id,
        });
      }
    }

    // Sort by sortOrder
    return items.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [tabs, groups]);

  // Handle drag end with optimistic updates and API persistence
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id || !workspaceId || !token) {
        return;
      }

      const activeId = String(active.id);
      const overId = String(over.id);

      const oldIndex = sortableItems.findIndex(item => item.id === activeId);
      const newIndex = sortableItems.findIndex(item => item.id === overId);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      // Calculate new order
      const reorderedItems = arrayMove(sortableItems, oldIndex, newIndex);

      // Build updates with new sortOrder values
      const tabUpdates: SortOrderUpdate[] = [];
      const groupUpdates: SortOrderUpdate[] = [];

      reorderedItems.forEach((item, index) => {
        const newSortOrder = index * 10;
        if (item.type === 'tab') {
          tabUpdates.push({ id: item.originalId, sortOrder: newSortOrder });
        } else {
          groupUpdates.push({ id: item.originalId, sortOrder: newSortOrder });
        }
      });

      // Store previous state for rollback
      const prevTabs = [...tabs];
      const prevGroups = [...groups];

      // Optimistic update - update local state immediately
      if (tabUpdates.length > 0) {
        const updatedTabs = tabs.map(tab => {
          const update = tabUpdates.find(u => u.id === tab.id);
          return update ? { ...tab, sortOrder: update.sortOrder } : tab;
        });
        onTabsUpdate(updatedTabs);
      }

      if (groupUpdates.length > 0) {
        const updatedGroups = groups.map(group => {
          const update = groupUpdates.find(u => u.id === group.id);
          return update ? { ...group, sortOrder: update.sortOrder } : group;
        });
        onGroupsUpdate(updatedGroups);
      }

      // Persist to API
      setIsReordering(true);
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/tabs/reorder`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tabs: tabUpdates,
            groups: groupUpdates,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to persist tab order');
        }
      } catch (error) {
        console.error('Failed to persist tab order:', error);
        // Rollback on error
        onTabsUpdate(prevTabs);
        onGroupsUpdate(prevGroups);
        // Refetch to ensure consistency
        onRefetch?.();
      } finally {
        setIsReordering(false);
      }
    },
    [workspaceId, token, sortableItems, tabs, groups, onTabsUpdate, onGroupsUpdate, onRefetch]
  );

  // Configure sensors with activation distance to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return {
    sensors,
    handleDragEnd,
    sortableItems,
    isReordering,
  };
}

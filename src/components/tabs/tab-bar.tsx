'use client';

import { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react';
import Image from 'next/image';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useTabs, TabInfo } from '@/hooks/useTabs';
import { useWorkspaceState, WorkspaceStateUpdate } from '@/hooks/useWorkspaceState';
import { useTabReordering } from '@/hooks/useTabReordering';
import { CreateTabDialog } from './create-tab-dialog';
import { TabGroupIcon } from './tab-group-icon';
import { TabContextMenu } from './tab-context-menu';
import { SortableTabItem } from './sortable-tab-item';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { VoiceButton, VoiceButtonRef } from '@/components/voice/voice-button';
import { getTemplateIcon } from '@/components/icons/ai-icons';
import type { TabGroupInfo } from '@/hooks/useTabGroups';
import type { TabType } from '@/lib/db/schema';

interface TabBarProps {
  workspaceId: string | null;
  selectedTabId: string | null;
  onSelectTab: (tab: TabInfo | null) => void;
  onTabsChange?: (tabs: TabInfo[]) => void;
  onExposeDeleteTab?: (deleteTab: (tabId: string) => Promise<void>) => void;
  whisperEnabled?: boolean;
  onVoiceTranscription?: (text: string) => void;
  workspaceTechStacks?: string[];
  // Tab group props
  groups?: TabGroupInfo[];
  groupedTabIds?: Set<string>;
  activeGroupId?: string | null;
  onSelectGroup?: (groupId: string | null) => void;
  onUngroupTabs?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, newName: string) => void;
  onCloseGroup?: (groupId: string) => void;
  // Multi-select props
  multiSelectMode?: boolean;
  selectedTabIdsForGroup?: Set<string>;
  onToggleTabSelection?: (tabId: string) => void;
  onEnterMultiSelectMode?: () => void;
  onExitMultiSelectMode?: () => void;
  onCreateGroupClick?: () => void;
  // Drag and drop reordering props
  onGroupsUpdate?: (groups: TabGroupInfo[]) => void;
  onRefetch?: () => void;
}

export interface TabBarRef {
  toggleVoice: () => Promise<string | null>;
  refreshTabs: () => void;
}

export const TabBar = forwardRef<TabBarRef, TabBarProps>(function TabBar({
  workspaceId,
  selectedTabId,
  onSelectTab,
  onTabsChange,
  onExposeDeleteTab,
  whisperEnabled,
  onVoiceTranscription,
  workspaceTechStacks = [],
  // Tab group props
  groups = [],
  groupedTabIds = new Set(),
  activeGroupId = null,
  onSelectGroup,
  onUngroupTabs,
  onRenameGroup,
  onCloseGroup,
  // Multi-select props
  multiSelectMode = false,
  selectedTabIdsForGroup = new Set(),
  onToggleTabSelection,
  onEnterMultiSelectMode,
  onExitMultiSelectMode,
  onCreateGroupClick,
  // Drag and drop reordering props
  onGroupsUpdate,
  onRefetch,
}, ref) {
  const {
    tabs,
    isLoading,
    fetchTabs,
    createTab,
    startTab,
    deleteTab,
    duplicateTab,
    setTabs,
  } = useTabs(workspaceId);

  // Filter out tabs that are in groups (for display in tab bar)
  const visibleTabs = useMemo(() =>
    tabs.filter(tab => !groupedTabIds.has(tab.id)),
    [tabs, groupedTabIds]
  );

  // Use the tab reordering hook for drag-and-drop
  const {
    sensors,
    handleDragEnd,
    sortableItems,
  } = useTabReordering({
    workspaceId,
    tabs: visibleTabs,
    groups,
    onTabsUpdate: setTabs,
    onGroupsUpdate: onGroupsUpdate || (() => {}),
    onRefetch: onRefetch || fetchTabs,
  });

  // Get sortable IDs for the SortableContext
  const sortableIds = useMemo(() =>
    sortableItems.map(item => item.id),
    [sortableItems]
  );

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tabToDelete, setTabToDelete] = useState<TabInfo | null>(null);
  const [groupToClose, setGroupToClose] = useState<TabGroupInfo | null>(null);
  const [agentUpdating, setAgentUpdating] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ tab: TabInfo; position: { x: number; y: number } } | null>(null);
  const prevAgentUpdating = useRef(false);
  const voiceButtonRef = useRef<VoiceButtonRef>(null);

  // Expose toggleVoice method to parent
  useImperativeHandle(ref, () => ({
    toggleVoice: async () => {
      return voiceButtonRef.current?.toggle() ?? null;
    },
    refreshTabs: () => {
      fetchTabs();
    },
  }), [fetchTabs]);

  // Handle workspace state updates (agent updating status)
  const handleWorkspaceUpdate = useCallback((update: WorkspaceStateUpdate) => {
    if (update.agentUpdating !== undefined) {
      setAgentUpdating(update.agentUpdating);
    }
  }, []);

  // Subscribe to workspace state updates
  useWorkspaceState({
    workspaceIds: workspaceId ? [workspaceId] : undefined,
    onUpdate: handleWorkspaceUpdate,
  });

  // Refresh tabs when agent update completes (agentUpdating: true -> false)
  useEffect(() => {
    if (prevAgentUpdating.current && !agentUpdating) {
      console.log('Agent update completed, refreshing tabs...');
      fetchTabs();
    }
    prevAgentUpdating.current = agentUpdating;
  }, [agentUpdating, fetchTabs]);

  useEffect(() => {
    if (workspaceId) {
      fetchTabs();
    }
  }, [workspaceId, fetchTabs]);

  useEffect(() => {
    onTabsChange?.(tabs);
  }, [tabs, onTabsChange]);

  // Expose deleteTab function to parent
  useEffect(() => {
    onExposeDeleteTab?.(deleteTab);
  }, [deleteTab, onExposeDeleteTab]);

  // Auto-select first running tab or first tab when tabs change
  useEffect(() => {
    if (tabs.length > 0 && !selectedTabId && !activeGroupId) {
      const runningTab = tabs.find(t => t.status === 'running');
      onSelectTab(runningTab || tabs[0]);
    }
  }, [tabs, selectedTabId, activeGroupId, onSelectTab]);

  const handleCreateTab = async (
    name: string,
    templateId: string | null,
    args?: string[],
    tabType?: TabType
  ) => {
    try {
      setActionLoading('create');
      const tab = await createTab(name, templateId, args, undefined, tabType);
      onSelectTab(tab);
    } catch (error) {
      console.error('Failed to create tab:', error);
      throw error;
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartTab = async (tab: TabInfo) => {
    try {
      setActionLoading(tab.id);
      const startedTab = await startTab(tab.id);
      onSelectTab(startedTab);
    } catch (error) {
      console.error('Failed to start tab:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteTabClick = (e: React.MouseEvent, tab: TabInfo) => {
    e.stopPropagation();
    setTabToDelete(tab);
  };

  const confirmDeleteTab = async () => {
    if (!tabToDelete) return;

    try {
      setActionLoading(tabToDelete.id);
      await deleteTab(tabToDelete.id);
      if (selectedTabId === tabToDelete.id) {
        onSelectTab(tabs.find(t => t.id !== tabToDelete.id) || null);
      }
    } catch (error) {
      console.error('Failed to delete tab:', error);
    } finally {
      setActionLoading(null);
      setTabToDelete(null);
    }
  };

  const handleCloseGroupClick = (group: TabGroupInfo) => {
    setGroupToClose(group);
  };

  const confirmCloseGroup = async () => {
    if (!groupToClose) return;

    try {
      onCloseGroup?.(groupToClose.id);
    } catch (error) {
      console.error('Failed to close group:', error);
    } finally {
      setGroupToClose(null);
    }
  };

  const handleTabClick = (tab: TabInfo) => {
    // In multi-select mode, toggle selection instead of selecting tab
    if (multiSelectMode) {
      onToggleTabSelection?.(tab.id);
      return;
    }

    // Clear active group when selecting a single tab
    if (activeGroupId) {
      onSelectGroup?.(null);
    }

    // Static tabs (dashboard, git, docker) don't need starting - they're UI-only
    if (tab.tabType === 'dashboard' || tab.tabType === 'git' || tab.tabType === 'docker') {
      onSelectTab(tab);
    } else if (tab.status === 'running') {
      onSelectTab(tab);
    } else if (tab.status === 'pending' || tab.status === 'stopped') {
      handleStartTab(tab);
    }
  };

  const handleGroupClick = (group: TabGroupInfo) => {
    // Exit multi-select mode when selecting a group
    if (multiSelectMode) {
      onExitMultiSelectMode?.();
    }

    // Toggle group - if already active, deselect it
    if (activeGroupId === group.id) {
      onSelectGroup?.(null);
      // Select the first tab from the group
      const firstMember = group.members[0];
      if (firstMember) {
        const tab = tabs.find(t => t.id === firstMember.tabId);
        if (tab) onSelectTab(tab);
      }
    } else {
      // Clear single tab selection and activate group
      onSelectTab(null);
      onSelectGroup?.(group.id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tab: TabInfo) => {
    e.preventDefault();
    setContextMenu({ tab, position: { x: e.clientX, y: e.clientY } });
  };

  const handleDuplicateTab = async (tab: TabInfo) => {
    try {
      setActionLoading('duplicate');
      const newTab = await duplicateTab(tab);
      onSelectTab(newTab);
    } catch (error) {
      console.error('Failed to duplicate tab:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGroupWith = (currentTabId: string, otherTabId: string) => {
    // Enter multi-select mode and select both tabs, then create group
    onEnterMultiSelectMode?.();
    // Need to toggle both tabs after entering multi-select mode
    setTimeout(() => {
      onToggleTabSelection?.(currentTabId);
      onToggleTabSelection?.(otherTabId);
      // Trigger group creation after a small delay for state to update
      setTimeout(() => {
        onCreateGroupClick?.();
      }, 50);
    }, 0);
  };

  const handleStartMultiSelect = (tabId: string) => {
    onEnterMultiSelectMode?.();
    setTimeout(() => {
      onToggleTabSelection?.(tabId);
    }, 0);
  };

  if (!workspaceId) {
    return null;
  }

  // Get special tabs (only Dashboard) - these are not draggable
  const specialTabs = useMemo(() =>
    visibleTabs.filter(tab => tab.tabType === 'dashboard').sort((a, b) => a.sortOrder - b.sortOrder),
    [visibleTabs]
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-success';
      case 'starting':
        return 'bg-warning animate-pulse';
      case 'pending':
      case 'stopped':
        return 'bg-foreground-tertiary';
      case 'error':
        return 'bg-error';
      default:
        return 'bg-foreground-tertiary';
    }
  };

  // Helper function to render tab content
  const renderTabContent = (tab: TabInfo) => {
    const isSelected = selectedTabId === tab.id && !activeGroupId;
    const isSelectedForGroup = selectedTabIdsForGroup.has(tab.id);

    return (
      <div
        onClick={() => handleTabClick(tab)}
        onContextMenu={(e) => handleContextMenu(e, tab)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-t cursor-pointer group relative
          ${isSelected
            ? 'bg-background text-foreground'
            : isSelectedForGroup
              ? 'bg-primary/20 text-foreground ring-2 ring-primary'
              : 'bg-background-tertiary/50 text-foreground-secondary hover:bg-background-tertiary hover:text-foreground'
          }`}
      >
        {/* Multi-select checkbox */}
        {multiSelectMode && (
          <input
            type="checkbox"
            checked={isSelectedForGroup}
            onChange={() => onToggleTabSelection?.(tab.id)}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 rounded border-border accent-primary"
          />
        )}

        {/* Tab icon - use template icon if available, otherwise status dot */}
        {tab.icon ? (
          <span className="w-4 h-4 flex items-center justify-center">
            {getTemplateIcon(tab.icon, true, 'w-4 h-4')}
          </span>
        ) : tab.tabType === 'dashboard' ? (
          <span className="w-4 h-4 flex items-center justify-center text-sm">
            {'\u{1F4CA}'}
          </span>
        ) : tab.tabType === 'git' ? (
          <Image
            src="/icons/ai/github.png"
            alt="Git"
            width={16}
            height={16}
            className="w-4 h-4"
            unoptimized
          />
        ) : tab.tabType === 'docker' ? (
          <Image
            src="/icons/ai/docker.png"
            alt="Docker"
            width={16}
            height={16}
            className="w-4 h-4"
            unoptimized
          />
        ) : (
          <span className={`w-2 h-2 rounded-full ${getStatusColor(tab.status)}`} />
        )}
        <span className="text-sm whitespace-nowrap">{tab.name}</span>
        {actionLoading === tab.id ? (
          <span className="text-xs animate-spin">⏳</span>
        ) : !tab.isPinned && !multiSelectMode && tab.tabType !== 'dashboard' && (
          <button
            onClick={(e) => handleDeleteTabClick(e, tab)}
            className="opacity-0 group-hover:opacity-100 text-foreground-tertiary hover:text-error ml-1"
          >
            ×
          </button>
        )}
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="flex items-center gap-1 px-2 py-1 bg-background-secondary border-b border-border overflow-x-auto">
        {agentUpdating && (
          <span className="text-warning text-sm px-2 flex items-center gap-1">
            <span className="animate-spin">⟳</span>
            Agent updating...
          </span>
        )}

        {isLoading && tabs.length === 0 && !agentUpdating && (
          <span className="text-foreground-tertiary text-sm px-2">Loading tabs...</span>
        )}

        {/* Dashboard tab - not draggable, always first */}
        {specialTabs.map((tab) => (
          <div key={tab.id}>
            {renderTabContent(tab)}
          </div>
        ))}

        {/* Separator if we have special tabs and sortable items */}
        {specialTabs.length > 0 && sortableItems.length > 0 && (
          <div className="w-px h-6 bg-border mx-1" />
        )}

        {/* Sortable items (Tab Groups + Regular Tabs) */}
        <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
          {sortableItems.map((item) => {
            if (item.type === 'group') {
              const group = groups.find(g => g.id === item.originalId);
              if (!group) return null;

              return (
                <SortableTabItem key={item.id} id={item.id} disabled={multiSelectMode}>
                  <TabGroupIcon
                    group={group}
                    isActive={activeGroupId === group.id}
                    onClick={() => handleGroupClick(group)}
                    onUngroup={() => onUngroupTabs?.(group.id)}
                    onRename={(newName) => onRenameGroup?.(group.id, newName)}
                    onClose={() => handleCloseGroupClick(group)}
                  />
                </SortableTabItem>
              );
            } else {
              const tab = visibleTabs.find(t => t.id === item.originalId);
              if (!tab) return null;

              return (
                <SortableTabItem key={item.id} id={item.id} disabled={multiSelectMode}>
                  {renderTabContent(tab)}
                </SortableTabItem>
              );
            }
          })}
        </SortableContext>

      {/* New tab "+" button - styled like a tab */}
      {!multiSelectMode && (
        <button
          onClick={() => setIsCreateDialogOpen(true)}
          className="flex items-center justify-center px-3 py-1.5 rounded-t
            bg-background-tertiary/50 text-foreground-tertiary text-lg
            hover:bg-background-tertiary hover:text-foreground"
          title="New tab"
        >
          +
        </button>
      )}

      {/* Spacer to push right-side controls to the edge */}
      <div className="flex-grow" />

      {/* Multi-select mode controls */}
      {multiSelectMode && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground-secondary">
            {selectedTabIdsForGroup.size} selected
          </span>
          {selectedTabIdsForGroup.size >= 2 && (
            <button
              onClick={onCreateGroupClick}
              className="px-2 py-1 text-sm bg-primary text-white rounded hover:bg-primary-hover"
            >
              Create Group
            </button>
          )}
          <button
            onClick={onExitMultiSelectMode}
            className="px-2 py-1 text-foreground-tertiary hover:text-foreground text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Voice button - far right */}
      {whisperEnabled && onVoiceTranscription && !multiSelectMode && (() => {
        const selectedTab = tabs.find(t => t.id === selectedTabId);
        const isTerminalTab = selectedTab && selectedTab.tabType !== 'git';
        const isRunning = selectedTab?.status === 'running';
        const isDisabled = !selectedTabId || !isTerminalTab || !isRunning || !!activeGroupId;

        let disabledReason: string | undefined;
        if (activeGroupId) {
          disabledReason = 'Voice input not available in split view';
        } else if (!selectedTabId) {
          disabledReason = 'Select a tab first';
        } else if (!isTerminalTab) {
          disabledReason = 'Voice input only works with terminal tabs';
        } else if (!isRunning) {
          disabledReason = 'Start the tab first';
        }

        return (
          <VoiceButton
            ref={voiceButtonRef}
            onTranscription={onVoiceTranscription}
            disabled={isDisabled}
            disabledReason={disabledReason}
          />
        );
      })()}

      {/* Create tab dialog */}
      <CreateTabDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreate={handleCreateTab}
        isLoading={actionLoading === 'create'}
        workspaceTechStacks={workspaceTechStacks}
        existingTabTypes={tabs
          .filter((t) => ['dashboard', 'git', 'docker'].includes(t.tabType))
          .map((t) => t.tabType)}
      />

      {/* Delete tab confirmation */}
      <ConfirmDialog
        isOpen={!!tabToDelete}
        title="Delete Tab"
        message={`Are you sure you want to delete "${tabToDelete?.name}"?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDeleteTab}
        onCancel={() => setTabToDelete(null)}
      />

      {/* Close group confirmation */}
      <ConfirmDialog
        isOpen={!!groupToClose}
        title="Close Group"
        message={`Close all ${groupToClose?.members.length} tabs in "${groupToClose?.name}"?`}
        confirmLabel="Close All"
        confirmVariant="danger"
        onConfirm={confirmCloseGroup}
        onCancel={() => setGroupToClose(null)}
      />

      {/* Tab context menu */}
      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.tab}
          position={contextMenu.position}
          otherTabs={visibleTabs.filter(t => t.id !== contextMenu.tab.id)}
          groups={groups}
          onClose={() => setContextMenu(null)}
          onDelete={() => setTabToDelete(contextMenu.tab)}
          onDuplicate={() => handleDuplicateTab(contextMenu.tab)}
          onGroupWith={(otherTabId) => handleGroupWith(contextMenu.tab.id, otherTabId)}
          onStartMultiSelect={() => handleStartMultiSelect(contextMenu.tab.id)}
        />
      )}
      </div>
    </DndContext>
  );
});

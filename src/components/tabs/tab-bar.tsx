'use client';

import { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useTabs, TabInfo } from '@/hooks/useTabs';
import { useWorkspaceState, WorkspaceStateUpdate } from '@/hooks/useWorkspaceState';
import { CreateTabDialog } from './create-tab-dialog';
import { TabGroupIcon } from './tab-group-icon';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { VoiceButton, VoiceButtonRef } from '@/components/voice/voice-button';
import type { TabGroupInfo } from '@/hooks/useTabGroups';

interface TabBarProps {
  workspaceId: string | null;
  selectedTabId: string | null;
  onSelectTab: (tab: TabInfo | null) => void;
  onTabsChange?: (tabs: TabInfo[]) => void;
  onExposeDeleteTab?: (deleteTab: (tabId: string) => Promise<void>) => void;
  whisperEnabled?: boolean;
  onVoiceTranscription?: (text: string) => void;
  // Tab group props
  groups?: TabGroupInfo[];
  groupedTabIds?: Set<string>;
  activeGroupId?: string | null;
  onSelectGroup?: (groupId: string | null) => void;
  onUngroupTabs?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, newName: string) => void;
  // Multi-select props
  multiSelectMode?: boolean;
  selectedTabIdsForGroup?: Set<string>;
  onToggleTabSelection?: (tabId: string) => void;
  onEnterMultiSelectMode?: () => void;
  onExitMultiSelectMode?: () => void;
  onCreateGroupClick?: () => void;
}

export interface TabBarRef {
  toggleVoice: () => Promise<string | null>;
}

export const TabBar = forwardRef<TabBarRef, TabBarProps>(function TabBar({
  workspaceId,
  selectedTabId,
  onSelectTab,
  onTabsChange,
  onExposeDeleteTab,
  whisperEnabled,
  onVoiceTranscription,
  // Tab group props
  groups = [],
  groupedTabIds = new Set(),
  activeGroupId = null,
  onSelectGroup,
  onUngroupTabs,
  onRenameGroup,
  // Multi-select props
  multiSelectMode = false,
  selectedTabIdsForGroup = new Set(),
  onToggleTabSelection,
  onEnterMultiSelectMode,
  onExitMultiSelectMode,
  onCreateGroupClick,
}, ref) {
  const {
    tabs,
    isLoading,
    fetchTabs,
    createTab,
    startTab,
    deleteTab,
  } = useTabs(workspaceId);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tabToDelete, setTabToDelete] = useState<TabInfo | null>(null);
  const [agentUpdating, setAgentUpdating] = useState(false);
  const prevAgentUpdating = useRef(false);
  const voiceButtonRef = useRef<VoiceButtonRef>(null);

  // Expose toggleVoice method to parent
  useImperativeHandle(ref, () => ({
    toggleVoice: async () => {
      return voiceButtonRef.current?.toggle() ?? null;
    },
  }), []);

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

  const handleCreateTab = async (name: string, templateId: string, args?: string[]) => {
    try {
      setActionLoading('create');
      const tab = await createTab(name, templateId, args);
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

    // Git tabs don't need starting - they're UI-only
    if (tab.tabType === 'git') {
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

    // Clear single tab selection and activate group
    onSelectTab(null);
    onSelectGroup?.(group.id);
  };

  if (!workspaceId) {
    return null;
  }

  // Filter out tabs that are in groups
  const visibleTabs = tabs.filter(tab => !groupedTabIds.has(tab.id));

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

  return (
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

      {/* Tab Groups */}
      {groups.map((group) => (
        <TabGroupIcon
          key={group.id}
          group={group}
          isActive={activeGroupId === group.id}
          onClick={() => handleGroupClick(group)}
          onUngroup={() => onUngroupTabs?.(group.id)}
          onRename={(newName) => onRenameGroup?.(group.id, newName)}
        />
      ))}

      {/* Separator if we have groups and tabs */}
      {groups.length > 0 && visibleTabs.length > 0 && (
        <div className="w-px h-6 bg-border mx-1" />
      )}

      {/* Individual Tabs (not in groups) */}
      {visibleTabs.map((tab) => {
        const isSelected = selectedTabId === tab.id && !activeGroupId;
        const isSelectedForGroup = selectedTabIdsForGroup.has(tab.id);

        return (
          <div
            key={tab.id}
            onClick={() => handleTabClick(tab)}
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

            {/* Git icon for git tabs */}
            {tab.tabType === 'git' ? (
              <svg className="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3-3 3 3m0 6l-3 3-3-3" />
              </svg>
            ) : (
              <span className={`w-2 h-2 rounded-full ${getStatusColor(tab.status)}`} />
            )}
            <span className="text-sm whitespace-nowrap">{tab.name}</span>
            {actionLoading === tab.id ? (
              <span className="text-xs animate-spin">⏳</span>
            ) : !tab.isPinned && !multiSelectMode && (
              <button
                onClick={(e) => handleDeleteTabClick(e, tab)}
                className="opacity-0 group-hover:opacity-100 text-foreground-tertiary hover:text-error ml-1"
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      {/* Voice button */}
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

      {/* Multi-select mode controls */}
      {multiSelectMode ? (
        <div className="flex items-center gap-2 ml-auto">
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
      ) : (
        <>
          {/* Select button to enter multi-select mode */}
          {visibleTabs.length >= 2 && onEnterMultiSelectMode && (
            <button
              onClick={onEnterMultiSelectMode}
              className="px-2 py-1 text-foreground-tertiary hover:text-foreground text-sm"
              title="Select tabs to group"
            >
              Select
            </button>
          )}

          {/* New tab button */}
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="px-2 py-1 text-foreground-tertiary hover:text-foreground text-sm"
            title="New tab"
          >
            + New Tab
          </button>
        </>
      )}

      {/* Create tab dialog */}
      <CreateTabDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreate={handleCreateTab}
        isLoading={actionLoading === 'create'}
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
    </div>
  );
});

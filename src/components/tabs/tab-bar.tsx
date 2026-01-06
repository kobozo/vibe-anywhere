'use client';

import { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useTabs, TabInfo } from '@/hooks/useTabs';
import { useWorkspaceState, WorkspaceStateUpdate } from '@/hooks/useWorkspaceState';
import { CreateTabDialog } from './create-tab-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { VoiceButton, VoiceButtonRef } from '@/components/voice/voice-button';

interface TabBarProps {
  workspaceId: string | null;
  selectedTabId: string | null;
  onSelectTab: (tab: TabInfo | null) => void;
  onTabsChange?: (tabs: TabInfo[]) => void;
  onExposeDeleteTab?: (deleteTab: (tabId: string) => Promise<void>) => void;
  whisperEnabled?: boolean;
  onVoiceTranscription?: (text: string) => void;
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
}, ref) {
  const {
    tabs,
    isLoading,
    fetchTabs,
    createTab,
    startTab,
    deleteTab,
    setTabs,
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
    if (tabs.length > 0 && !selectedTabId) {
      const runningTab = tabs.find(t => t.status === 'running');
      onSelectTab(runningTab || tabs[0]);
    }
  }, [tabs, selectedTabId, onSelectTab]);

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

  if (!workspaceId) {
    return null;
  }

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

      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => {
            // Git tabs don't need starting - they're UI-only
            if (tab.tabType === 'git') {
              onSelectTab(tab);
            } else if (tab.status === 'running') {
              onSelectTab(tab);
            } else if (tab.status === 'pending' || tab.status === 'stopped') {
              handleStartTab(tab);
            }
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-t cursor-pointer group
            ${selectedTabId === tab.id
              ? 'bg-background text-foreground'
              : 'bg-background-tertiary/50 text-foreground-secondary hover:bg-background-tertiary hover:text-foreground'
            }`}
        >
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
          ) : !tab.isPinned && (
            <button
              onClick={(e) => handleDeleteTabClick(e, tab)}
              className="opacity-0 group-hover:opacity-100 text-foreground-tertiary hover:text-error ml-1"
            >
              ×
            </button>
          )}
        </div>
      ))}

      {/* Voice button */}
      {whisperEnabled && onVoiceTranscription && (() => {
        const selectedTab = tabs.find(t => t.id === selectedTabId);
        const isTerminalTab = selectedTab && selectedTab.tabType !== 'git';
        const isRunning = selectedTab?.status === 'running';
        const isDisabled = !selectedTabId || !isTerminalTab || !isRunning;

        let disabledReason: string | undefined;
        if (!selectedTabId) {
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

      {/* New tab button */}
      <button
        onClick={() => setIsCreateDialogOpen(true)}
        className="px-2 py-1 text-foreground-tertiary hover:text-foreground text-sm"
        title="New tab"
      >
        + New Tab
      </button>

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

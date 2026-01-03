'use client';

import { useEffect, useState } from 'react';
import { useTabs, TabInfo } from '@/hooks/useTabs';
import { CreateTabDialog } from './create-tab-dialog';

interface TabBarProps {
  workspaceId: string | null;
  selectedTabId: string | null;
  onSelectTab: (tab: TabInfo | null) => void;
  onTabsChange?: (tabs: TabInfo[]) => void;
}

export function TabBar({
  workspaceId,
  selectedTabId,
  onSelectTab,
  onTabsChange,
}: TabBarProps) {
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

  useEffect(() => {
    if (workspaceId) {
      fetchTabs();
    }
  }, [workspaceId, fetchTabs]);

  useEffect(() => {
    onTabsChange?.(tabs);
  }, [tabs, onTabsChange]);

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

  const handleDeleteTab = async (e: React.MouseEvent, tab: TabInfo) => {
    e.stopPropagation();

    if (!confirm(`Delete tab "${tab.name}"?`)) return;

    try {
      setActionLoading(tab.id);
      await deleteTab(tab.id);
      if (selectedTabId === tab.id) {
        onSelectTab(tabs.find(t => t.id !== tab.id) || null);
      }
    } catch (error) {
      console.error('Failed to delete tab:', error);
    } finally {
      setActionLoading(null);
    }
  };

  if (!workspaceId) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'starting':
        return 'bg-yellow-500 animate-pulse';
      case 'pending':
      case 'stopped':
        return 'bg-gray-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 border-b border-gray-700 overflow-x-auto">
      {isLoading && tabs.length === 0 && (
        <span className="text-gray-500 text-sm px-2">Loading tabs...</span>
      )}

      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => {
            if (tab.status === 'running') {
              onSelectTab(tab);
            } else if (tab.status === 'pending' || tab.status === 'stopped') {
              handleStartTab(tab);
            }
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-t cursor-pointer group
            ${selectedTabId === tab.id
              ? 'bg-gray-900 text-white'
              : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
        >
          <span className={`w-2 h-2 rounded-full ${getStatusColor(tab.status)}`} />
          <span className="text-sm whitespace-nowrap">{tab.name}</span>
          {actionLoading === tab.id ? (
            <span className="text-xs animate-spin">⏳</span>
          ) : (
            <button
              onClick={(e) => handleDeleteTab(e, tab)}
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 ml-1"
            >
              ×
            </button>
          )}
        </div>
      ))}

      {/* New tab button */}
      <button
        onClick={() => setIsCreateDialogOpen(true)}
        className="px-2 py-1 text-gray-500 hover:text-gray-300 text-sm"
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
    </div>
  );
}

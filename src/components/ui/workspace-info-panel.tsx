'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Workspace } from '@/lib/db/schema';

interface AgentInfo {
  connected: boolean;
  currentVersion: string | null;
  expectedVersion: string;
  updateAvailable: boolean;
  connectedAt: string | null;
  lastHeartbeat: string | null;
  tabCount: number;
}

interface TemplateInfo {
  name: string;
  vmid: number | null;
  status: string;
  techStacks: string[];
  inheritedTechStacks: string[];
}

interface WorkspaceInfoPanelProps {
  workspace: Workspace;
  onClose: () => void;
  onRestart: () => void;
  onDestroy: () => void;
  onDelete: () => void;
}

type TabId = 'overview' | 'container' | 'template' | 'agent' | 'actions';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', icon: '📋' },
  { id: 'container', label: 'Container', icon: '📦' },
  { id: 'template', label: 'Template', icon: '🎨' },
  { id: 'agent', label: 'Agent', icon: '🤖' },
  { id: 'actions', label: 'Actions', icon: '⚡' },
];

export function WorkspaceInfoPanel({
  workspace,
  onClose,
  onRestart,
  onDestroy,
  onDelete,
}: WorkspaceInfoPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const fetchAgentInfo = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/agent`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      if (response.ok) {
        const { data } = await response.json();
        setAgentInfo(data.agent);
      }
    } catch (error) {
      console.error('Failed to fetch agent info:', error);
    } finally {
      setLoading(false);
    }
  }, [workspace.id]);

  useEffect(() => {
    fetchAgentInfo();
    // Refresh every 5 seconds
    const interval = setInterval(fetchAgentInfo, 5000);
    return () => clearInterval(interval);
  }, [fetchAgentInfo]);

  // Fetch template info once on mount
  useEffect(() => {
    const fetchTemplateInfo = async () => {
      try {
        const response = await fetch(`/api/workspaces/${workspace.id}/template`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });
        if (response.ok) {
          const { data } = await response.json();
          setTemplateInfo(data.template);
        }
      } catch (error) {
        console.error('Failed to fetch template info:', error);
      } finally {
        setTemplateLoading(false);
      }
    };
    fetchTemplateInfo();
  }, [workspace.id]);

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateMessage(null);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/agent/update`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      const result = await response.json();
      if (response.ok) {
        setUpdateMessage(result.data.message);
        // Refresh agent info after a delay (agent will restart)
        setTimeout(fetchAgentInfo, 3000);
      } else {
        setUpdateMessage(`Error: ${result.error?.message || 'Update failed'}`);
      }
    } catch (error) {
      setUpdateMessage('Error: Failed to send update request');
    } finally {
      setUpdating(false);
    }
  };

  const hasContainer = workspace.containerId && workspace.containerStatus !== 'none';

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const renderOverviewTab = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <span className="text-foreground-secondary">Name:</span>
        <span className="text-foreground font-medium">{workspace.name}</span>
        <span className="text-foreground-secondary">Branch:</span>
        <span className="text-foreground font-mono">{workspace.branchName}</span>
        <span className="text-foreground-secondary">Status:</span>
        <span className={`font-medium ${
          workspace.status === 'active' ? 'text-success' :
          workspace.status === 'error' ? 'text-error' :
          'text-foreground'
        }`}>
          {workspace.status}
        </span>
        <span className="text-foreground-secondary">Created:</span>
        <span className="text-foreground text-xs">{formatDate(workspace.createdAt?.toString() || null)}</span>
      </div>
    </div>
  );

  const renderContainerTab = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <span className="text-foreground-secondary">Status:</span>
        <span className={`font-medium ${
          workspace.containerStatus === 'running' ? 'text-success' :
          workspace.containerStatus === 'exited' || workspace.containerStatus === 'dead' ? 'text-error' :
          'text-foreground-secondary'
        }`}>
          {workspace.containerStatus || 'none'}
        </span>
        {workspace.containerId && (
          <>
            <span className="text-foreground-secondary">ID:</span>
            <span className="text-foreground font-mono text-xs">{workspace.containerId}</span>
          </>
        )}
        {workspace.containerIp && (
          <>
            <span className="text-foreground-secondary">IP:</span>
            <span className="text-foreground font-mono">{workspace.containerIp}</span>
          </>
        )}
      </div>
      {!hasContainer && (
        <p className="text-sm text-foreground-secondary italic">No container provisioned</p>
      )}
    </div>
  );

  const renderTemplateTab = () => (
    <div className="space-y-3">
      {templateLoading ? (
        <div className="text-sm text-foreground-secondary">Loading...</div>
      ) : templateInfo ? (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-foreground-secondary">Name:</span>
          <span className="text-foreground font-medium">{templateInfo.name}</span>
          {templateInfo.vmid && (
            <>
              <span className="text-foreground-secondary">VMID:</span>
              <span className="text-foreground font-mono">{templateInfo.vmid}</span>
            </>
          )}
          <span className="text-foreground-secondary">Status:</span>
          <span className={`font-medium ${
            templateInfo.status === 'ready' ? 'text-success' :
            templateInfo.status === 'error' ? 'text-error' :
            'text-warning'
          }`}>
            {templateInfo.status}
          </span>
          {(templateInfo.techStacks.length > 0 || templateInfo.inheritedTechStacks.length > 0) && (
            <>
              <span className="text-foreground-secondary">Tech stacks:</span>
              <div className="flex flex-wrap gap-1">
                {[...templateInfo.inheritedTechStacks, ...templateInfo.techStacks].map((stack) => (
                  <span key={stack} className="px-2 py-0.5 bg-background rounded text-xs text-foreground">
                    {stack}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-foreground-secondary italic">No template assigned</p>
      )}
    </div>
  );

  const renderAgentTab = () => (
    <div className="space-y-3">
      {loading ? (
        <div className="text-sm text-foreground-secondary">Loading...</div>
      ) : agentInfo ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-foreground-secondary">Connected:</span>
            <span className={`font-medium ${agentInfo.connected ? 'text-success' : 'text-error'}`}>
              {agentInfo.connected ? 'Yes' : 'No'}
            </span>
            <span className="text-foreground-secondary">Version:</span>
            <span className="text-foreground">
              {agentInfo.currentVersion || 'Unknown'}
              {agentInfo.updateAvailable && (
                <span className="ml-2 text-warning text-xs">(update available)</span>
              )}
            </span>
            {agentInfo.connected && (
              <>
                <span className="text-foreground-secondary">Tabs:</span>
                <span className="text-foreground">{agentInfo.tabCount}</span>
                <span className="text-foreground-secondary">Last heartbeat:</span>
                <span className="text-foreground text-xs">{formatDate(agentInfo.lastHeartbeat)}</span>
              </>
            )}
          </div>

          {agentInfo.updateAvailable && workspace.containerStatus === 'running' && (
            <div className="pt-2 border-t border-border">
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="w-full px-3 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-yellow-800 disabled:cursor-not-allowed rounded text-sm text-white transition-colors"
              >
                {updating ? 'Updating...' : `Update to v${agentInfo.expectedVersion}`}
              </button>
              {!agentInfo.connected && (
                <p className="mt-1 text-xs text-foreground-secondary">
                  Will push update via SSH and restart service
                </p>
              )}
              {updateMessage && (
                <p className={`mt-2 text-xs ${updateMessage.startsWith('Error') ? 'text-error' : 'text-success'}`}>
                  {updateMessage}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-foreground-secondary italic">No agent info available</p>
      )}
    </div>
  );

  const renderActionsTab = () => (
    <div className="space-y-2">
      {hasContainer && (
        <>
          <button
            onClick={() => { onRestart(); onClose(); }}
            className="w-full px-3 py-2 bg-primary hover:bg-primary-hover rounded text-sm text-foreground transition-colors flex items-center justify-center gap-2"
          >
            <span>Restart Container</span>
          </button>
          <button
            onClick={() => { onDestroy(); onClose(); }}
            className="w-full px-3 py-2 bg-orange-600 hover:bg-orange-500 rounded text-sm text-foreground transition-colors flex items-center justify-center gap-2"
          >
            <span>Destroy Container</span>
          </button>
        </>
      )}
      <button
        onClick={() => { onDelete(); onClose(); }}
        className="w-full px-3 py-2 bg-error hover:bg-error/80 rounded text-sm text-foreground transition-colors flex items-center justify-center gap-2"
      >
        <span>Delete Workspace</span>
      </button>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverviewTab();
      case 'container':
        return renderContainerTab();
      case 'template':
        return renderTemplateTab();
      case 'agent':
        return renderAgentTab();
      case 'actions':
        return renderActionsTab();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-background-secondary rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">{workspace.name}</h3>
          <button onClick={onClose} className="text-foreground-secondary hover:text-foreground text-xl leading-none">
            &times;
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-0 px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary bg-background/50'
                  : 'text-foreground-secondary hover:text-foreground hover:bg-background/30'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4 min-h-[200px]">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}

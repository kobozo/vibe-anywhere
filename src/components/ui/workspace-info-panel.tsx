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

interface WorkspaceInfoPanelProps {
  workspace: Workspace;
  onClose: () => void;
  onRestart: () => void;
  onDestroy: () => void;
  onDelete: () => void;
}

export function WorkspaceInfoPanel({
  workspace,
  onClose,
  onRestart,
  onDestroy,
  onDelete,
}: WorkspaceInfoPanelProps) {
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{workspace.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Workspace Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-400">Workspace</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-gray-400">Branch:</span>
              <span className="text-gray-200">{workspace.branchName}</span>
              <span className="text-gray-400">Status:</span>
              <span className="text-gray-200">{workspace.status}</span>
            </div>
          </div>

          {/* Container Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-400">Container</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-gray-400">Status:</span>
              <span className={`${
                workspace.containerStatus === 'running' ? 'text-green-400' :
                workspace.containerStatus === 'exited' || workspace.containerStatus === 'dead' ? 'text-red-400' :
                'text-gray-200'
              }`}>
                {workspace.containerStatus || 'none'}
              </span>
              {workspace.containerId && (
                <>
                  <span className="text-gray-400">ID:</span>
                  <span className="text-gray-200 font-mono text-xs">{workspace.containerId}</span>
                </>
              )}
              {workspace.containerIp && (
                <>
                  <span className="text-gray-400">IP:</span>
                  <span className="text-gray-200 font-mono">{workspace.containerIp}</span>
                </>
              )}
            </div>
          </div>

          {/* Agent Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-400">Agent</h4>
            {loading ? (
              <div className="text-sm text-gray-400">Loading...</div>
            ) : agentInfo ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-gray-400">Connected:</span>
                  <span className={agentInfo.connected ? 'text-green-400' : 'text-red-400'}>
                    {agentInfo.connected ? 'Yes' : 'No'}
                  </span>
                  <span className="text-gray-400">Version:</span>
                  <span className="text-gray-200">
                    {agentInfo.currentVersion || 'Unknown'}
                    {agentInfo.updateAvailable && (
                      <span className="ml-2 text-yellow-400 text-xs">
                        (v{agentInfo.expectedVersion} available)
                      </span>
                    )}
                  </span>
                  {agentInfo.connected && (
                    <>
                      <span className="text-gray-400">Tabs:</span>
                      <span className="text-gray-200">{agentInfo.tabCount}</span>
                    </>
                  )}
                </div>

                {/* Update Button - show when update available AND container is running */}
                {agentInfo.updateAvailable && workspace.containerStatus === 'running' && (
                  <div className="mt-2">
                    <button
                      onClick={handleUpdate}
                      disabled={updating}
                      className="w-full px-3 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-yellow-800 disabled:cursor-not-allowed rounded text-sm text-white transition-colors"
                    >
                      {updating ? 'Updating...' : `Update Agent to v${agentInfo.expectedVersion}`}
                    </button>
                    {!agentInfo.connected && (
                      <p className="mt-1 text-xs text-gray-400">
                        Will push update via SSH and restart service
                      </p>
                    )}
                    {updateMessage && (
                      <p className={`mt-2 text-xs ${updateMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                        {updateMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-400">No agent info available</div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-gray-700 space-y-2">
          {hasContainer && (
            <>
              <button
                onClick={() => { onRestart(); onClose(); }}
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white transition-colors flex items-center justify-center gap-2"
              >
                <span>Restart Container</span>
              </button>
              <button
                onClick={() => { onDestroy(); onClose(); }}
                className="w-full px-3 py-2 bg-orange-600 hover:bg-orange-500 rounded text-sm text-white transition-colors flex items-center justify-center gap-2"
              >
                <span>Destroy Container</span>
              </button>
            </>
          )}
          <button
            onClick={() => { onDelete(); onClose(); }}
            className="w-full px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-sm text-white transition-colors flex items-center justify-center gap-2"
          >
            <span>Delete Workspace</span>
          </button>
        </div>
      </div>
    </div>
  );
}

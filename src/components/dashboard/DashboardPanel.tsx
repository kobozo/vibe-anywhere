'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Workspace, Repository } from '@/lib/db/schema';
import { useEnvVarSync } from '@/hooks/useEnvVarSync';
import { EnvVarSyncDialog } from '@/components/workspaces/env-var-sync-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface AgentInfo {
  connected: boolean;
  currentVersion: string | null;
  expectedVersion: string;
  updateAvailable: boolean;
  connectedAt: string | null;
  lastHeartbeat: string | null;
  tabCount: number;
  tailscaleConnected: boolean | null;
}

interface TemplateInfo {
  name: string;
  vmid: number | null;
  status: string;
  techStacks: string[];
  inheritedTechStacks: string[];
}

interface EnvVar {
  key: string;
  value: string;
  encrypted: boolean;
  inherited?: boolean;
}

interface DashboardPanelProps {
  workspace: Workspace;
  repository: Repository | null;
  onRestartContainer?: () => void;
  onShutdownContainer?: () => void;
  onStartContainer?: () => void;
  onRedeployContainer?: () => void;
  onDestroyContainer?: () => void;
  onDeleteWorkspace?: () => void;
}

export function DashboardPanel({
  workspace,
  repository,
  onRestartContainer,
  onShutdownContainer,
  onStartContainer,
  onRedeployContainer,
  onDestroyContainer,
  onDeleteWorkspace,
}: DashboardPanelProps) {
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [agentLoading, setAgentLoading] = useState(true);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [envLoading, setEnvLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [envSyncMessage, setEnvSyncMessage] = useState<string | null>(null);
  const [envSyncing, setEnvSyncing] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [showShutdownConfirm, setShowShutdownConfirm] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showRedeployConfirm, setShowRedeployConfirm] = useState(false);
  const [isRedeploying, setIsRedeploying] = useState(false);
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);
  const [isDestroying, setIsDestroying] = useState(false);
  const [showDeleteWorkspaceConfirm, setShowDeleteWorkspaceConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Env var sync check before container operations
  const {
    isChecking: isEnvCheckLoading,
    isSyncing: isEnvSyncLoading,
    isDialogOpen: isEnvSyncDialogOpen,
    diff: envDiff,
    operation: envSyncOperation,
    checkBeforeOperation,
    handleSyncAndProceed,
    handleProceedWithoutSync,
    handleCancel: handleEnvSyncCancel,
  } = useEnvVarSync();

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
      setAgentLoading(false);
    }
  }, [workspace.id]);

  useEffect(() => {
    fetchAgentInfo();
    const interval = setInterval(fetchAgentInfo, 5000);
    return () => clearInterval(interval);
  }, [fetchAgentInfo]);

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

  useEffect(() => {
    const fetchEnvVars = async () => {
      if (!repository?.id) {
        setEnvLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/repositories/${repository.id}/env-vars`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });
        if (response.ok) {
          const { data } = await response.json();
          const vars: EnvVar[] = [];
          // Inherited vars (from template) - returns Record<string, string>
          if (data.inheritedEnvVars) {
            for (const [key, value] of Object.entries(data.inheritedEnvVars as Record<string, string>)) {
              vars.push({ key, value: value as string, encrypted: false, inherited: true });
            }
          }
          // Own vars - returns Array<{ key, value, encrypted }>
          if (Array.isArray(data.envVars)) {
            for (const entry of data.envVars as Array<{ key: string; value: string; encrypted: boolean }>) {
              vars.push({ key: entry.key, value: entry.value, encrypted: entry.encrypted, inherited: false });
            }
          }
          setEnvVars(vars);
        }
      } catch (error) {
        console.error('Failed to fetch env vars:', error);
      } finally {
        setEnvLoading(false);
      }
    };
    fetchEnvVars();
  }, [repository?.id]);

  const handleAgentUpdate = async () => {
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

  const handleWriteEnvFile = async () => {
    setEnvSyncing(true);
    setEnvSyncMessage(null);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/env-file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      const result = await response.json();
      if (response.ok) {
        setEnvSyncMessage('Successfully wrote .env file to workspace');
      } else {
        setEnvSyncMessage(`Error: ${result.error?.message || 'Failed to write .env file'}`);
      }
    } catch (error) {
      setEnvSyncMessage('Error: Failed to write .env file');
    } finally {
      setEnvSyncing(false);
    }
  };

  const handleSyncEnvFromFile = async () => {
    setEnvSyncing(true);
    setEnvSyncMessage(null);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/env-file`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      const result = await response.json();
      if (response.ok) {
        setEnvSyncMessage(`Synced ${result.data?.count || 0} variables from .env file`);
        // Refresh env vars
        const envResponse = await fetch(`/api/repositories/${repository?.id}/env-vars`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });
        if (envResponse.ok) {
          const { data } = await envResponse.json();
          const vars: EnvVar[] = [];
          // Inherited vars (from template) - returns Record<string, string>
          if (data.inheritedEnvVars) {
            for (const [key, value] of Object.entries(data.inheritedEnvVars as Record<string, string>)) {
              vars.push({ key, value: value as string, encrypted: false, inherited: true });
            }
          }
          // Own vars - returns Array<{ key, value, encrypted }>
          if (Array.isArray(data.envVars)) {
            for (const entry of data.envVars as Array<{ key: string; value: string; encrypted: boolean }>) {
              vars.push({ key: entry.key, value: entry.value, encrypted: entry.encrypted, inherited: false });
            }
          }
          setEnvVars(vars);
        }
      } else {
        setEnvSyncMessage(`Error: ${result.error?.message || 'Failed to sync from .env file'}`);
      }
    } catch (error) {
      setEnvSyncMessage('Error: Failed to sync from .env file');
    } finally {
      setEnvSyncing(false);
    }
  };

  const hasContainer = workspace.containerId && workspace.containerStatus !== 'none';

  const handleRestartConfirm = async () => {
    if (!onRestartContainer) return;
    setIsRestarting(true);
    setShowRestartConfirm(false);
    try {
      await onRestartContainer();
    } finally {
      setIsRestarting(false);
    }
  };

  const handleShutdownConfirm = async () => {
    if (!onShutdownContainer) return;
    setIsShuttingDown(true);
    setShowShutdownConfirm(false);
    try {
      await onShutdownContainer();
    } finally {
      setIsShuttingDown(false);
    }
  };

  const handleStartContainer = async () => {
    if (!onStartContainer) return;
    setIsStarting(true);
    try {
      await onStartContainer();
    } finally {
      setIsStarting(false);
    }
  };

  const handleRedeployConfirm = async () => {
    if (!onRedeployContainer) return;
    setIsRedeploying(true);
    setShowRedeployConfirm(false);
    try {
      await onRedeployContainer();
    } finally {
      setIsRedeploying(false);
    }
  };

  const handleDestroyConfirm = async () => {
    if (!onDestroyContainer) return;
    setIsDestroying(true);
    setShowDestroyConfirm(false);
    try {
      await onDestroyContainer();
    } finally {
      setIsDestroying(false);
    }
  };

  const handleDeleteWorkspaceConfirm = async () => {
    if (!onDeleteWorkspace) return;
    setIsDeleting(true);
    setShowDeleteWorkspaceConfirm(false);
    try {
      await onDeleteWorkspace();
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateStr: string | Date | number | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <div className="h-full overflow-auto bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{workspace.name}</h1>
            <p className="text-foreground-secondary font-mono text-sm">{workspace.branchName}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            workspace.status === 'active' ? 'bg-success/20 text-success' :
            workspace.status === 'archived' ? 'bg-foreground-tertiary/20 text-foreground-secondary' :
            'bg-warning/20 text-warning'
          }`}>
            {workspace.status}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Container Card */}
          <div className="bg-background-secondary rounded-lg p-4 border border-border">
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <span>Container</span>
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-foreground-secondary">Status:</span>
                <span className={`font-medium ${
                  workspace.containerStatus === 'running' ? 'text-success' :
                  workspace.containerStatus === 'exited' || workspace.containerStatus === 'dead' ? 'text-error' :
                  'text-foreground-secondary'
                }`}>
                  {workspace.containerStatus || 'none'}
                </span>
              </div>
              {workspace.containerId && (
                <div className="flex justify-between">
                  <span className="text-foreground-secondary">ID:</span>
                  <span className="text-foreground font-mono text-xs">{workspace.containerId}</span>
                </div>
              )}
              {workspace.containerIp && (
                <div className="flex justify-between">
                  <span className="text-foreground-secondary">IP:</span>
                  <span className="text-foreground font-mono">{workspace.containerIp}</span>
                </div>
              )}
              {!hasContainer && (
                <p className="text-foreground-tertiary italic">No container provisioned</p>
              )}
            </div>
            {/* Container action buttons - 2x2 grid */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {/* Row 1: Restart | Shutdown/Start */}
              {hasContainer && (
                <>
                  <button
                    onClick={() => setShowRestartConfirm(true)}
                    disabled={workspace.containerStatus !== 'running' || isRestarting}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-foreground transition-colors"
                  >
                    {isRestarting ? 'Restarting...' : 'Restart'}
                  </button>
                  {workspace.containerStatus === 'running' ? (
                    <button
                      onClick={() => setShowShutdownConfirm(true)}
                      disabled={isShuttingDown}
                      className="px-3 py-2 bg-foreground-tertiary hover:bg-foreground-tertiary/80 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-foreground transition-colors"
                    >
                      {isShuttingDown ? 'Stopping...' : 'Shutdown'}
                    </button>
                  ) : (
                    <button
                      onClick={handleStartContainer}
                      disabled={isStarting || workspace.containerStatus === 'creating'}
                      className="px-3 py-2 bg-success hover:bg-success/80 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-foreground transition-colors"
                    >
                      {isStarting ? 'Starting...' : 'Start'}
                    </button>
                  )}
                </>
              )}

              {/* Row 2: Redeploy | Destroy/Deploy */}
              {hasContainer ? (
                <>
                  <button
                    onClick={() => {
                      if (onRedeployContainer) {
                        checkBeforeOperation(workspace.id, 'redeploy', async () => {
                          setShowRedeployConfirm(true);
                        });
                      }
                    }}
                    disabled={isEnvCheckLoading || isRedeploying}
                    className="px-3 py-2 bg-primary hover:bg-primary-hover rounded text-sm text-foreground transition-colors disabled:opacity-50"
                  >
                    {isRedeploying ? 'Redeploying...' : isEnvCheckLoading && envSyncOperation === 'redeploy' ? 'Checking...' : 'Redeploy'}
                  </button>
                  <button
                    onClick={() => {
                      if (onDestroyContainer) {
                        checkBeforeOperation(workspace.id, 'destroy', async () => {
                          setShowDestroyConfirm(true);
                        });
                      }
                    }}
                    disabled={isEnvCheckLoading || isDestroying}
                    className="px-3 py-2 bg-orange-600 hover:bg-orange-500 rounded text-sm text-foreground transition-colors disabled:opacity-50"
                  >
                    {isDestroying ? 'Destroying...' : isEnvCheckLoading && envSyncOperation === 'destroy' ? 'Checking...' : 'Destroy'}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStartContainer}
                  disabled={isStarting}
                  className="col-span-2 px-3 py-2 bg-success hover:bg-success/80 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-foreground transition-colors"
                >
                  {isStarting ? 'Deploying...' : 'Deploy'}
                </button>
              )}
            </div>
          </div>

          {/* Agent Card */}
          <div className="bg-background-secondary rounded-lg p-4 border border-border">
            <h2 className="text-lg font-semibold text-foreground mb-3">Agent</h2>
            {agentLoading ? (
              <div className="text-sm text-foreground-secondary">Loading...</div>
            ) : agentInfo ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground-secondary">Connected:</span>
                  <span className={`font-medium ${agentInfo.connected ? 'text-success' : 'text-error'}`}>
                    {agentInfo.connected ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-secondary">Version:</span>
                  <span className="text-foreground">
                    {agentInfo.currentVersion || 'Unknown'}
                    {agentInfo.updateAvailable && (
                      <span className="ml-2 text-warning text-xs">(update available)</span>
                    )}
                  </span>
                </div>
                {agentInfo.connected && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-foreground-secondary">Tabs:</span>
                      <span className="text-foreground">{agentInfo.tabCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-secondary">Tailscale:</span>
                      <span className={`font-medium ${
                        agentInfo.tailscaleConnected === true ? 'text-success' :
                        agentInfo.tailscaleConnected === false ? 'text-error' :
                        'text-foreground-secondary'
                      }`} title={
                        agentInfo.tailscaleConnected === true ? 'Connected to Tailscale network' :
                        agentInfo.tailscaleConnected === false ? 'Tailscale disconnected - Chrome browser control unavailable' :
                        'Tailscale status unknown'
                      }>
                        {agentInfo.tailscaleConnected === true ? 'Connected' :
                         agentInfo.tailscaleConnected === false ? 'Disconnected' :
                         'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-secondary">Heartbeat:</span>
                      <span className="text-foreground text-xs">{formatDate(agentInfo.lastHeartbeat)}</span>
                    </div>
                  </>
                )}
                {agentInfo.updateAvailable && workspace.containerStatus === 'running' && (
                  <div className="pt-2">
                    <button
                      onClick={handleAgentUpdate}
                      disabled={updating}
                      className="w-full px-3 py-2 bg-warning hover:bg-warning/80 disabled:bg-warning/50 disabled:cursor-not-allowed rounded text-sm text-black transition-colors"
                    >
                      {updating ? 'Updating...' : `Update to v${agentInfo.expectedVersion}`}
                    </button>
                    {updateMessage && (
                      <p className={`mt-2 text-xs ${updateMessage.startsWith('Error') ? 'text-error' : 'text-success'}`}>
                        {updateMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-foreground-tertiary italic">No agent info available</p>
            )}
          </div>

          {/* Template Card */}
          <div className="bg-background-secondary rounded-lg p-4 border border-border">
            <h2 className="text-lg font-semibold text-foreground mb-3">Template</h2>
            {templateLoading ? (
              <div className="text-sm text-foreground-secondary">Loading...</div>
            ) : templateInfo ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground-secondary">Name:</span>
                  <span className="text-foreground font-medium">{templateInfo.name}</span>
                </div>
                {templateInfo.vmid && (
                  <div className="flex justify-between">
                    <span className="text-foreground-secondary">VMID:</span>
                    <span className="text-foreground font-mono">{templateInfo.vmid}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-foreground-secondary">Status:</span>
                  <span className={`font-medium ${
                    templateInfo.status === 'ready' ? 'text-success' :
                    templateInfo.status === 'error' ? 'text-error' :
                    'text-warning'
                  }`}>
                    {templateInfo.status}
                  </span>
                </div>
                {(templateInfo.techStacks.length > 0 || templateInfo.inheritedTechStacks.length > 0) && (
                  <div className="pt-2">
                    <span className="text-foreground-secondary block mb-1">Tech stacks:</span>
                    <div className="flex flex-wrap gap-1">
                      {[...templateInfo.inheritedTechStacks, ...templateInfo.techStacks].map((stack) => (
                        <span key={stack} className="px-2 py-0.5 bg-background rounded text-xs text-foreground">
                          {stack}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-foreground-tertiary italic">No template assigned</p>
            )}
          </div>

          {/* Workspace Info Card */}
          <div className="bg-background-secondary rounded-lg p-4 border border-border">
            <h2 className="text-lg font-semibold text-foreground mb-3">Workspace Info</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-foreground-secondary">Created:</span>
                <span className="text-foreground text-xs">{formatDate(workspace.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-secondary">Last Activity:</span>
                <span className="text-foreground text-xs">{formatDate(workspace.lastActivityAt)}</span>
              </div>
              {workspace.hasUncommittedChanges && (
                <div className="flex items-center gap-2 pt-2 text-warning">
                  <span>Uncommitted changes</span>
                </div>
              )}
            </div>
            <div className="mt-4">
              <button
                onClick={() => {
                  if (onDeleteWorkspace) {
                    checkBeforeOperation(workspace.id, 'delete', async () => {
                      setShowDeleteWorkspaceConfirm(true);
                    });
                  }
                }}
                disabled={isEnvCheckLoading || isDeleting}
                className="w-full px-3 py-2 bg-error hover:bg-error/80 rounded text-sm text-foreground transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : isEnvCheckLoading && envSyncOperation === 'delete' ? 'Checking...' : 'Delete Workspace'}
              </button>
            </div>
          </div>
        </div>

        {/* Environment Variables Card (full width) */}
        <div className="bg-background-secondary rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Environment Variables</h2>
            {workspace.containerStatus === 'running' && (
              <div className="flex gap-2">
                <button
                  onClick={handleWriteEnvFile}
                  disabled={envSyncing}
                  className="px-3 py-1 bg-primary hover:bg-primary-hover disabled:bg-primary/50 rounded text-sm text-foreground transition-colors"
                >
                  {envSyncing ? 'Syncing...' : 'Write .env'}
                </button>
                <button
                  onClick={handleSyncEnvFromFile}
                  disabled={envSyncing}
                  className="px-3 py-1 bg-background-tertiary hover:bg-background-input border border-border rounded text-sm text-foreground transition-colors"
                >
                  Sync from .env
                </button>
              </div>
            )}
          </div>
          {envSyncMessage && (
            <p className={`mb-3 text-sm ${envSyncMessage.startsWith('Error') ? 'text-error' : 'text-success'}`}>
              {envSyncMessage}
            </p>
          )}
          {envLoading ? (
            <div className="text-sm text-foreground-secondary">Loading...</div>
          ) : envVars.length > 0 ? (
            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-x-2 gap-y-1 text-sm font-mono items-baseline">
              {envVars.map((env) => (
                <React.Fragment key={env.key}>
                  <span className="text-foreground">{env.key}</span>
                  <span className="text-foreground-tertiary">=</span>
                  <span className="text-foreground-secondary break-all">
                    {env.encrypted ? '********' : env.value}
                  </span>
                  <span className="flex items-center gap-1">
                    {env.inherited && (
                      <span className="text-xs text-foreground-tertiary">(inherited)</span>
                    )}
                    {env.encrypted && (
                      <span className="text-xs text-warning">locked</span>
                    )}
                  </span>
                </React.Fragment>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground-tertiary italic">No environment variables configured</p>
          )}
          <p className="mt-3 text-xs text-foreground-tertiary">
            Environment variables are injected into the container at startup.
            Use &quot;Write .env&quot; to create a .env file in the workspace root,
            or &quot;Sync from .env&quot; to import variables from an existing .env file.
          </p>
        </div>

      </div>

      {/* Env Var Sync Dialog */}
      <EnvVarSyncDialog
        isOpen={isEnvSyncDialogOpen}
        workspaceName={workspace.name}
        operation={envSyncOperation || 'redeploy'}
        diff={envDiff}
        onSyncAndProceed={handleSyncAndProceed}
        onProceedWithoutSync={handleProceedWithoutSync}
        onCancel={handleEnvSyncCancel}
        isLoading={isEnvSyncLoading}
      />

      {/* Restart Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showRestartConfirm}
        title="Restart Container"
        message={
          <div className="space-y-3">
            <p>Are you sure you want to restart the container?</p>
            <div className="text-sm space-y-2">
              <p className="text-warning">
                <strong>Warning:</strong> Terminal tab state and command history will be lost.
              </p>
              <p className="text-foreground-secondary">
                All terminal tabs will restart automatically with their configured settings.
              </p>
              <p className="text-success">
                Files on the filesystem will remain untouched.
              </p>
            </div>
          </div>
        }
        confirmLabel="Restart"
        cancelLabel="Cancel"
        confirmVariant="warning"
        onConfirm={handleRestartConfirm}
        onCancel={() => setShowRestartConfirm(false)}
        isLoading={isRestarting}
      />

      {/* Shutdown Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showShutdownConfirm}
        title="Shutdown Container"
        message={
          <div className="space-y-3">
            <p>Are you sure you want to shutdown the container?</p>
            <div className="text-sm space-y-2">
              <p className="text-warning">
                <strong>Warning:</strong> Terminal tab state and command history will be lost.
              </p>
              <p className="text-foreground-secondary">
                All terminal tabs will be stopped. Start the container to resume.
              </p>
              <p className="text-success">
                Files on the filesystem will remain untouched.
              </p>
            </div>
          </div>
        }
        confirmLabel="Shutdown"
        cancelLabel="Cancel"
        confirmVariant="warning"
        onConfirm={handleShutdownConfirm}
        onCancel={() => setShowShutdownConfirm(false)}
        isLoading={isShuttingDown}
      />

      {/* Redeploy Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showRedeployConfirm}
        title="Redeploy Container"
        message={
          <div className="space-y-3">
            <p>Are you sure you want to redeploy the container?</p>
            <div className="text-sm space-y-2">
              <p className="text-error">
                <strong>Warning:</strong> This will destroy the current container and create a fresh one.
              </p>
              <p className="text-warning">
                All terminal state, command history, and uncommitted changes will be lost.
              </p>
              <p className="text-foreground-secondary">
                The repository will be re-cloned from the remote.
              </p>
            </div>
          </div>
        }
        confirmLabel="Redeploy"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={handleRedeployConfirm}
        onCancel={() => setShowRedeployConfirm(false)}
        isLoading={isRedeploying}
      />

      {/* Destroy Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDestroyConfirm}
        title="Destroy Container"
        message={
          <div className="space-y-3">
            <p>Are you sure you want to destroy the container?</p>
            <div className="text-sm space-y-2">
              <p className="text-error">
                <strong>Warning:</strong> This will permanently remove the container.
              </p>
              <p className="text-warning">
                All terminal state, command history, and uncommitted changes will be lost.
              </p>
              <p className="text-foreground-secondary">
                You can deploy a new container later using the Deploy button.
              </p>
            </div>
          </div>
        }
        confirmLabel="Destroy"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={handleDestroyConfirm}
        onCancel={() => setShowDestroyConfirm(false)}
        isLoading={isDestroying}
      />

      {/* Delete Workspace Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteWorkspaceConfirm}
        title="Delete Workspace"
        message={
          <div className="space-y-3">
            <p>Are you sure you want to delete this workspace?</p>
            <div className="text-sm space-y-2">
              <p className="text-error">
                <strong>Warning:</strong> This action cannot be undone.
              </p>
              <p className="text-warning">
                The workspace, its container, and all uncommitted changes will be permanently deleted.
              </p>
              <p className="text-foreground-secondary">
                The Git branch and remote changes are not affected.
              </p>
            </div>
          </div>
        }
        confirmLabel="Delete Workspace"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={handleDeleteWorkspaceConfirm}
        onCancel={() => setShowDeleteWorkspaceConfirm(false)}
        isLoading={isDeleting}
      />
    </div>
  );
}

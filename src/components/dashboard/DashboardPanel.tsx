'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Workspace, Repository } from '@/lib/db/schema';

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

interface EnvVar {
  key: string;
  value: string;
  encrypted: boolean;
  inherited?: boolean;
}

interface GitHook {
  name: string;
  exists: boolean;
  executable: boolean;
  size: number;
  isSample: boolean;
}

interface DashboardPanelProps {
  workspace: Workspace;
  repository: Repository | null;
  onRestartContainer?: () => void;
  onDestroyContainer?: () => void;
  onDeleteWorkspace?: () => void;
}

export function DashboardPanel({
  workspace,
  repository,
  onRestartContainer,
  onDestroyContainer,
  onDeleteWorkspace,
}: DashboardPanelProps) {
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [gitHooks, setGitHooks] = useState<GitHook[]>([]);
  const [gitHooksAvailable, setGitHooksAvailable] = useState(false);
  const [agentLoading, setAgentLoading] = useState(true);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [envLoading, setEnvLoading] = useState(true);
  const [hooksLoading, setHooksLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [envSyncMessage, setEnvSyncMessage] = useState<string | null>(null);
  const [envSyncing, setEnvSyncing] = useState(false);

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
          // Inherited vars
          if (data.inherited) {
            for (const [key, entry] of Object.entries(data.inherited as Record<string, { value: string; encrypted: boolean }>)) {
              vars.push({ key, value: entry.value, encrypted: entry.encrypted, inherited: true });
            }
          }
          // Own vars
          if (data.envVars) {
            for (const [key, entry] of Object.entries(data.envVars as Record<string, { value: string; encrypted: boolean }>)) {
              vars.push({ key, value: entry.value, encrypted: entry.encrypted, inherited: false });
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

  // Fetch git hooks
  useEffect(() => {
    const fetchGitHooks = async () => {
      if (workspace.containerStatus !== 'running') {
        setHooksLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/workspaces/${workspace.id}/git-hooks`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });
        if (response.ok) {
          const { data } = await response.json();
          setGitHooksAvailable(data.available);
          setGitHooks(data.hooks || []);
        }
      } catch (error) {
        console.error('Failed to fetch git hooks:', error);
      } finally {
        setHooksLoading(false);
      }
    };
    fetchGitHooks();
  }, [workspace.id, workspace.containerStatus]);

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
          if (data.inherited) {
            for (const [key, entry] of Object.entries(data.inherited as Record<string, { value: string; encrypted: boolean }>)) {
              vars.push({ key, value: entry.value, encrypted: entry.encrypted, inherited: true });
            }
          }
          if (data.envVars) {
            for (const [key, entry] of Object.entries(data.envVars as Record<string, { value: string; encrypted: boolean }>)) {
              vars.push({ key, value: entry.value, encrypted: entry.encrypted, inherited: false });
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

  const formatDate = (dateStr: string | Date | null) => {
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
            {hasContainer && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={onRestartContainer}
                  className="flex-1 px-3 py-2 bg-primary hover:bg-primary-hover rounded text-sm text-foreground transition-colors"
                >
                  Restart
                </button>
                <button
                  onClick={onDestroyContainer}
                  className="flex-1 px-3 py-2 bg-orange-600 hover:bg-orange-500 rounded text-sm text-foreground transition-colors"
                >
                  Destroy
                </button>
              </div>
            )}
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
                onClick={onDeleteWorkspace}
                className="w-full px-3 py-2 bg-error hover:bg-error/80 rounded text-sm text-foreground transition-colors"
              >
                Delete Workspace
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
            <div className="space-y-1">
              {envVars.map((env) => (
                <div key={env.key} className="flex items-center gap-2 text-sm font-mono">
                  <span className="text-foreground">{env.key}</span>
                  <span className="text-foreground-tertiary">=</span>
                  <span className="text-foreground-secondary">
                    {env.encrypted ? '********' : env.value}
                  </span>
                  {env.inherited && (
                    <span className="text-xs text-foreground-tertiary">(inherited)</span>
                  )}
                  {env.encrypted && (
                    <span className="text-xs text-warning">locked</span>
                  )}
                </div>
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

        {/* Git Hooks Card (full width) */}
        <div className="bg-background-secondary rounded-lg p-4 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-3">Git Hooks</h2>
          {hooksLoading ? (
            <div className="text-sm text-foreground-secondary">Loading...</div>
          ) : !gitHooksAvailable ? (
            <p className="text-sm text-foreground-tertiary italic">
              {workspace.containerStatus !== 'running'
                ? 'Start the container to view git hooks'
                : 'Git hooks not available'}
            </p>
          ) : gitHooks.length === 0 ? (
            <p className="text-sm text-foreground-tertiary italic">No git hooks found</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {gitHooks.map((hook) => (
                <div
                  key={hook.name}
                  className={`flex items-center gap-2 px-3 py-2 rounded border ${
                    hook.exists && hook.executable
                      ? 'bg-success/10 border-success/30'
                      : hook.exists
                      ? 'bg-warning/10 border-warning/30'
                      : hook.isSample
                      ? 'bg-background-tertiary/50 border-border-secondary'
                      : 'bg-background-tertiary/30 border-border-secondary opacity-50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${
                    hook.exists && hook.executable
                      ? 'bg-success'
                      : hook.exists
                      ? 'bg-warning'
                      : 'bg-foreground-tertiary'
                  }`} />
                  <span className="text-sm text-foreground truncate">{hook.name}</span>
                  {hook.exists && !hook.executable && (
                    <span className="text-xs text-warning" title="Hook exists but is not executable">!</span>
                  )}
                  {hook.isSample && (
                    <span className="text-xs text-foreground-tertiary">.sample</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-foreground-tertiary">
            Git hooks are scripts that run automatically when certain git events occur.
            Green indicates an active hook, yellow indicates a hook that exists but is not executable.
          </p>
        </div>
      </div>
    </div>
  );
}

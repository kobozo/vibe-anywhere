'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface TemplateStatus {
  exists: boolean;
  vmid: number | null;
  isTemplate: boolean;
  sshKeyConfigured: boolean;
  sshKeyAvailable: boolean;
  nodes: string[];
  selectedNode: string | null;
  techStacks: string[];
  customPostInstallScript?: string;
}

interface VmidConfig {
  startingVmid: number;
  nextWorkspaceVmid: number;
  defaultStartingVmid: number;
}

interface CreateTemplateProgress {
  step: string;
  progress: number;
  message: string;
}

interface ProxmoxSettings {
  vlanTag?: number;
  defaultStorage?: string;
  defaultMemory?: number;
  defaultCpuCores?: number;
}

interface TechStackInfo {
  id: string;
  name: string;
  description: string;
  requiresNesting?: boolean;
}

export function ProxmoxTemplate() {
  const { token } = useAuth();
  const [status, setStatus] = useState<TemplateStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProxmoxBackend, setIsProxmoxBackend] = useState<boolean | null>(null);

  // Settings state
  const [proxmoxSettings, setProxmoxSettings] = useState<ProxmoxSettings>({});
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<ProxmoxSettings>({});

  // Tech stacks state
  const [availableTechStacks, setAvailableTechStacks] = useState<TechStackInfo[]>([]);
  const [selectedTechStacks, setSelectedTechStacks] = useState<string[]>([]);
  const [customScript, setCustomScript] = useState<string>('');

  // Creation state
  const [isCreating, setIsCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState<CreateTemplateProgress | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string>('');
  const [forceRecreate, setForceRecreate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // VMID configuration state
  const [vmidConfig, setVmidConfig] = useState<VmidConfig | null>(null);
  const [editingVmid, setEditingVmid] = useState(false);
  const [newStartingVmid, setNewStartingVmid] = useState<string>('');

  const fetchStatus = useCallback(async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      setError(null);

      // Fetch template status, VMID config, Proxmox settings, and tech stacks in parallel
      const [templateRes, vmidRes, settingsRes, stacksRes] = await Promise.all([
        fetch('/api/proxmox/template', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/proxmox/vmid-config', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/proxmox/settings', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/tech-stacks', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const templateData = await templateRes.json();
      const vmidData = await vmidRes.json();
      const settingsData = await settingsRes.json();
      const stacksData = await stacksRes.json();

      if (!templateRes.ok) {
        // Check if it's because backend is not proxmox
        if (templateData.error?.includes('Proxmox backend not configured')) {
          setIsProxmoxBackend(false);
          return;
        }
        throw new Error(templateData.error || 'Failed to fetch template status');
      }

      setIsProxmoxBackend(true);
      setStatus(templateData);
      if (templateData.selectedNode) {
        setSelectedNode(templateData.selectedNode);
      }

      // Set tech stacks from template config
      setSelectedTechStacks(templateData.techStacks || []);
      setCustomScript(templateData.customPostInstallScript || '');

      if (vmidRes.ok) {
        setVmidConfig(vmidData);
        setNewStartingVmid(String(vmidData.startingVmid));
      }

      if (settingsRes.ok) {
        setProxmoxSettings(settingsData);
        setSettingsForm(settingsData);
      }

      if (stacksRes.ok) {
        setAvailableTechStacks(stacksData.stacks || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch template status');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSaveSettings = async () => {
    if (!token) return;

    try {
      setError(null);
      const res = await fetch('/api/proxmox/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      setProxmoxSettings(data);
      setEditingSettings(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  const handleCreateTemplate = async (force: boolean = false) => {
    if (!status) return;

    // Set force flag for use in startTemplateCreation
    setForceRecreate(force);

    // If only one node, skip confirmation
    if (status.nodes.length === 1) {
      await startTemplateCreation(force);
    } else {
      setShowConfirm(true);
    }
  };

  const startTemplateCreation = async (force?: boolean) => {
    if (!token) return;

    // Use passed parameter or fall back to state
    const useForce = force !== undefined ? force : forceRecreate;

    setShowConfirm(false);
    setIsCreating(true);
    setCreateProgress({ step: 'starting', progress: 0, message: 'Starting template creation...' });
    setError(null);

    try {
      const response = await fetch('/api/proxmox/template/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          node: selectedNode || undefined,
          force: useForce,
          techStacks: selectedTechStacks,
          customPostInstallScript: customScript || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create template');
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response stream');
      }

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === 'progress') {
              setCreateProgress(data);
            } else if (currentEvent === 'complete') {
              setCreateProgress({ step: 'complete', progress: 100, message: data.message });
              await fetchStatus();
            } else if (currentEvent === 'error') {
              throw new Error(data.message);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTemplate = () => {
    if (!token || !status?.vmid) return;
    setShowDeleteConfirm(true);
  };

  const handleSaveVmidConfig = async () => {
    if (!token) return;

    const vmid = parseInt(newStartingVmid, 10);
    if (isNaN(vmid) || vmid < 100) {
      setError('Starting VMID must be a number >= 100');
      return;
    }

    try {
      setError(null);
      const res = await fetch('/api/proxmox/vmid-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ startingVmid: vmid }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save VMID configuration');
      }

      setEditingVmid(false);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save VMID configuration');
    }
  };

  const confirmDeleteTemplate = async () => {
    if (!token || !status?.vmid) return;
    setShowDeleteConfirm(false);

    try {
      setIsLoading(true);
      const res = await fetch(`/api/proxmox/template?vmid=${status.vmid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete template');
      }

      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTechStack = (stackId: string) => {
    setSelectedTechStacks(prev =>
      prev.includes(stackId)
        ? prev.filter(id => id !== stackId)
        : [...prev, stackId]
    );
  };

  if (isLoading && isProxmoxBackend === null) {
    return <div className="text-gray-500 text-sm py-4">Loading template status...</div>;
  }

  if (isProxmoxBackend === false) {
    return (
      <div className="text-gray-500 text-sm py-4">
        Proxmox template management is only available when using the Proxmox backend.
        Currently using Docker backend.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* ============================================ */}
      {/* SETTINGS SECTION */}
      {/* ============================================ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-gray-700 pb-2">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Settings</h3>
          {!editingSettings && (
            <button
              onClick={() => setEditingSettings(true)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Edit
            </button>
          )}
        </div>

        {editingSettings ? (
          <div className="p-4 bg-gray-700/30 rounded space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">VLAN Tag</label>
                <input
                  type="number"
                  min="1"
                  max="4094"
                  placeholder="No VLAN"
                  value={settingsForm.vlanTag ?? ''}
                  onChange={(e) => setSettingsForm(prev => ({
                    ...prev,
                    vlanTag: e.target.value ? parseInt(e.target.value) : undefined
                  }))}
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Default Storage</label>
                <input
                  type="text"
                  placeholder="local-lvm"
                  value={settingsForm.defaultStorage ?? ''}
                  onChange={(e) => setSettingsForm(prev => ({
                    ...prev,
                    defaultStorage: e.target.value || undefined
                  }))}
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Default Memory (MB)</label>
                <input
                  type="number"
                  min="256"
                  placeholder="2048"
                  value={settingsForm.defaultMemory ?? ''}
                  onChange={(e) => setSettingsForm(prev => ({
                    ...prev,
                    defaultMemory: e.target.value ? parseInt(e.target.value) : undefined
                  }))}
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Default CPU Cores</label>
                <input
                  type="number"
                  min="1"
                  placeholder="2"
                  value={settingsForm.defaultCpuCores ?? ''}
                  onChange={(e) => setSettingsForm(prev => ({
                    ...prev,
                    defaultCpuCores: e.target.value ? parseInt(e.target.value) : undefined
                  }))}
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveSettings}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white"
              >
                Save Settings
              </button>
              <button
                onClick={() => {
                  setEditingSettings(false);
                  setSettingsForm(proxmoxSettings);
                }}
                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gray-700/30 rounded">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">VLAN Tag:</span>
                <span className="ml-2 text-white">{proxmoxSettings.vlanTag ?? 'Not set'}</span>
              </div>
              <div>
                <span className="text-gray-400">Default Storage:</span>
                <span className="ml-2 text-white">{proxmoxSettings.defaultStorage || 'local-lvm'}</span>
              </div>
              <div>
                <span className="text-gray-400">Default Memory:</span>
                <span className="ml-2 text-white">{proxmoxSettings.defaultMemory || 2048} MB</span>
              </div>
              <div>
                <span className="text-gray-400">Default CPU Cores:</span>
                <span className="ml-2 text-white">{proxmoxSettings.defaultCpuCores || 2}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* TEMPLATE SECTION */}
      {/* ============================================ */}
      <div className="space-y-4">
        <div className="border-b border-gray-700 pb-2">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Template</h3>
        </div>

        {/* VMID Configuration */}
        <div className="p-4 bg-gray-700/30 rounded space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-white">VMID Configuration</h4>
          </div>

          {editingVmid ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">Starting VMID:</label>
                <input
                  type="number"
                  min="100"
                  value={newStartingVmid}
                  onChange={(e) => setNewStartingVmid(e.target.value)}
                  className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <p className="text-xs text-gray-500">
                Template will use this VMID. Workspaces will use {newStartingVmid ? parseInt(newStartingVmid) + 1 : '?'}+
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSaveVmidConfig()}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingVmid(false);
                    setNewStartingVmid(String(vmidConfig?.startingVmid || 500));
                  }}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Starting VMID:</span>
                  <span className="ml-2 text-white">{vmidConfig?.startingVmid || 500}</span>
                </div>
                <div>
                  <span className="text-gray-400">Next Workspace:</span>
                  <span className="ml-2 text-white">{vmidConfig?.nextWorkspaceVmid || 501}</span>
                </div>
              </div>
              {!status?.exists && (
                <button
                  onClick={() => setEditingVmid(true)}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs text-white"
                >
                  Change Starting VMID
                </button>
              )}
              {status?.exists && (
                <p className="text-xs text-gray-500">
                  Delete the template to change the starting VMID.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Template Status */}
        <div className="p-4 bg-gray-700/30 rounded space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-white">Status</h4>
            {status?.exists && (
              <span className="text-xs px-2 py-1 bg-green-600/20 text-green-400 rounded">
                Ready
              </span>
            )}
            {!status?.exists && (
              <span className="text-xs px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded">
                Not Created
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Template VMID:</span>
              <span className="ml-2 text-white">{status?.vmid || 'Not set'}</span>
            </div>
            <div>
              <span className="text-gray-400">Nodes:</span>
              <span className="ml-2 text-white">{status?.nodes.join(', ') || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-gray-400">SSH Key:</span>
              <span className={`ml-2 ${status?.sshKeyAvailable ? 'text-green-400' : 'text-red-400'}`}>
                {status?.sshKeyAvailable ? 'Available' : 'Missing'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Is Template:</span>
              <span className={`ml-2 ${status?.isTemplate ? 'text-green-400' : 'text-gray-400'}`}>
                {status?.isTemplate ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>

        {/* Tech Stacks Selection */}
        <div className="p-4 bg-gray-700/30 rounded space-y-3">
          <div>
            <h4 className="text-sm font-medium text-white">Pre-installed Tech Stacks</h4>
            <p className="text-xs text-gray-500 mt-1">
              Select tech stacks to pre-install in the template. This speeds up workspace creation.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {availableTechStacks.map((stack) => (
              <label
                key={stack.id}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                  selectedTechStacks.includes(stack.id)
                    ? 'bg-blue-600/20 border border-blue-500/50'
                    : 'bg-gray-700/50 border border-gray-600/50 hover:bg-gray-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTechStacks.includes(stack.id)}
                  onChange={() => toggleTechStack(stack.id)}
                  disabled={status?.exists}
                  className="rounded border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm text-white">{stack.name}</div>
                  <div className="text-xs text-gray-400">{stack.description}</div>
                  {stack.requiresNesting && (
                    <div className="text-xs text-yellow-400">Requires LXC nesting</div>
                  )}
                </div>
              </label>
            ))}
          </div>

          {status?.exists && (
            <p className="text-xs text-gray-500">
              Delete and recreate the template to change tech stacks.
            </p>
          )}
        </div>

        {/* Custom Post-Install Script */}
        <div className="p-4 bg-gray-700/30 rounded space-y-3">
          <div>
            <h4 className="text-sm font-medium text-white">Custom Post-Install Script</h4>
            <p className="text-xs text-gray-500 mt-1">
              Optional bash commands to run after provisioning. Use this for custom packages or configuration.
            </p>
          </div>

          <textarea
            value={customScript}
            onChange={(e) => setCustomScript(e.target.value)}
            disabled={status?.exists}
            placeholder="# Example:
apt-get install -y your-package
echo 'Custom config' >> /etc/somefile"
            className="w-full h-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white font-mono placeholder-gray-500 disabled:opacity-50"
          />

          {status?.exists && customScript && (
            <p className="text-xs text-gray-500">
              Delete and recreate the template to modify the custom script.
            </p>
          )}
        </div>

        {/* Creation Progress */}
        {isCreating && createProgress && (
          <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-400">{createProgress.step}</span>
              <span className="text-sm text-blue-400">{createProgress.progress}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${createProgress.progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">{createProgress.message}</p>
          </div>
        )}

        {/* Node Selection Confirmation Dialog */}
        {showConfirm && status && status.nodes.length > 1 && (
          <div className="p-4 bg-gray-700/50 rounded space-y-3">
            <h4 className="text-sm font-medium text-white">Select Proxmox Node</h4>
            <p className="text-xs text-gray-400">
              Multiple nodes detected. Select which node to create the template on.
            </p>
            <select
              value={selectedNode}
              onChange={(e) => setSelectedNode(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
            >
              {status.nodes.map((node) => (
                <option key={node} value={node}>
                  {node} {node === status.selectedNode ? '(auto-selected)' : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => startTemplateCreation()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white"
              >
                {forceRecreate ? 'Recreate' : 'Create'} on {selectedNode}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded space-y-3">
            <h4 className="text-sm font-medium text-white">Delete Template?</h4>
            <p className="text-xs text-gray-300">
              Are you sure you want to delete the template (VMID: {status?.vmid})? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmDeleteTemplate}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-sm text-white"
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {!isCreating && !showConfirm && !showDeleteConfirm && (
          <div className="flex items-center gap-3">
            {!status?.exists ? (
              <button
                onClick={() => handleCreateTemplate(false)}
                disabled={!status?.sshKeyAvailable}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm text-white"
              >
                Create Template
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleCreateTemplate(true)}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm text-white"
                >
                  Recreate Template
                </button>
                <button
                  onClick={() => handleDeleteTemplate()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-sm text-white"
                >
                  Delete Template
                </button>
              </>
            )}
          </div>
        )}

        {/* Help Text */}
        {!status?.sshKeyAvailable && (
          <p className="text-xs text-yellow-400">
            SSH key not found. Ensure SSH keys are mounted to /home/sessionhub/.ssh/ in the container.
          </p>
        )}

        <p className="text-xs text-gray-500">
          The LXC template contains base packages, Claude CLI (if Node.js is selected), and the Session Hub agent.
          Workspaces are cloned from this template with SSH access pre-configured.
        </p>
      </div>
    </div>
  );
}

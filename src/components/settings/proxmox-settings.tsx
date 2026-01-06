'use client';

import { useState, useEffect } from 'react';
import { useProxmoxSettings } from '@/hooks/useProxmoxSettings';
import { useAuth } from '@/hooks/useAuth';

/**
 * Collapsible section component
 */
function Section({
  title,
  defaultOpen = false,
  children,
  badge,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-400 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ▶
          </span>
          <span className="text-sm font-medium text-white">{title}</span>
          {badge}
        </div>
      </button>
      {isOpen && <div className="p-4 bg-gray-800/50">{children}</div>}
    </div>
  );
}

/**
 * Connection form component
 */
function ConnectionForm({
  settings,
  onSave,
  onTest,
  isTesting,
  isLoading,
}: {
  settings: {
    host?: string;
    port?: number;
    tokenId?: string;
    node?: string;
  } | null;
  onSave: (data: { host: string; port: number; tokenId: string; tokenSecret: string; node: string }) => Promise<void>;
  onTest: (data: { host: string; port: number; tokenId: string; tokenSecret: string; node: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
  isTesting: boolean;
  isLoading: boolean;
}) {
  const [host, setHost] = useState(settings?.host || '');
  const [port, setPort] = useState(settings?.port || 8006);
  const [tokenId, setTokenId] = useState(settings?.tokenId || '');
  const [tokenSecret, setTokenSecret] = useState('');
  const [node, setNode] = useState(settings?.node || '');
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setHasChanges(
      host !== (settings?.host || '') ||
      port !== (settings?.port || 8006) ||
      tokenId !== (settings?.tokenId || '') ||
      tokenSecret !== '' ||
      node !== (settings?.node || '')
    );
  }, [host, port, tokenId, tokenSecret, node, settings]);

  const handleTest = async () => {
    if (!host || !tokenId || !tokenSecret || !node) {
      setTestResult({ success: false, error: 'All fields are required' });
      return;
    }
    const result = await onTest({ host, port, tokenId, tokenSecret, node });
    setTestResult(result);
  };

  const handleSave = async () => {
    if (!host || !tokenId || !tokenSecret || !node) return;
    await onSave({ host, port, tokenId, tokenSecret, node });
    setTokenSecret(''); // Clear after save
    setTestResult(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Host</label>
          <input
            type="text"
            placeholder="192.168.1.100"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Port</label>
          <input
            type="number"
            min="1"
            max="65535"
            value={port}
            onChange={(e) => setPort(parseInt(e.target.value) || 8006)}
            className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Token ID</label>
        <input
          type="text"
          placeholder="root@pam!session-hub"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Token Secret {settings?.tokenId && <span className="text-gray-500">(leave empty to keep existing)</span>}
        </label>
        <input
          type="password"
          placeholder={settings?.tokenId ? '••••••••' : 'Enter token secret'}
          value={tokenSecret}
          onChange={(e) => setTokenSecret(e.target.value)}
          className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Node</label>
        <input
          type="text"
          placeholder="pve"
          value={node}
          onChange={(e) => setNode(e.target.value)}
          className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
        />
      </div>

      {testResult && (
        <div className={`p-2 rounded text-sm ${testResult.success ? 'bg-green-900/30 text-green-400 border border-green-700' : 'bg-red-900/30 text-red-400 border border-red-700'}`}>
          {testResult.success ? testResult.message : testResult.error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={!host || !tokenId || !tokenSecret || !node || isTesting}
          className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm text-white"
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges || !host || !tokenId || !tokenSecret || !node || isLoading}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm text-white"
        >
          {isLoading ? 'Saving...' : 'Save Connection'}
        </button>
      </div>
    </div>
  );
}

/**
 * Generic settings form for simple key-value fields
 */
function SimpleSettingsForm({
  fields,
  values,
  onSave,
  isLoading,
}: {
  fields: Array<{
    key: string;
    label: string;
    type: 'text' | 'number';
    placeholder?: string;
    min?: number;
    max?: number;
  }>;
  values: Record<string, string | number | undefined>;
  onSave: (data: Record<string, string | number | null>) => Promise<void>;
  isLoading: boolean;
}) {
  const [formValues, setFormValues] = useState<Record<string, string | number>>(
    Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? '']))
  );
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const newHasChanges = fields.some((f) => {
      const current = formValues[f.key];
      const original = values[f.key];
      return String(current || '') !== String(original || '');
    });
    setHasChanges(newHasChanges);
  }, [formValues, values, fields]);

  const handleSave = async () => {
    const data: Record<string, string | number | null> = {};
    fields.forEach((f) => {
      const val = formValues[f.key];
      if (val === '' || val === undefined) {
        data[f.key] = null;
      } else if (f.type === 'number') {
        data[f.key] = typeof val === 'number' ? val : parseInt(String(val)) || null;
      } else {
        data[f.key] = String(val);
      }
    });
    await onSave(data);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-xs text-gray-400 mb-1">{field.label}</label>
            <input
              type={field.type}
              placeholder={field.placeholder}
              min={field.min}
              max={field.max}
              value={formValues[field.key] ?? ''}
              onChange={(e) =>
                setFormValues((prev) => ({
                  ...prev,
                  [field.key]: field.type === 'number' ? (e.target.value ? parseInt(e.target.value) : '') : e.target.value,
                }))
              }
              className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={!hasChanges || isLoading}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm text-white"
      >
        {isLoading ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

/**
 * Main Proxmox Settings component
 */
export function ProxmoxSettings() {
  const { token } = useAuth();
  const {
    settings,
    isLoading,
    isTesting,
    error,
    fetchSettings,
    testConnection,
    saveConnectionSettings,
    saveNetworkSettings,
    saveResourceSettings,
  } = useProxmoxSettings();

  // VMID Configuration state
  const [vmidConfig, setVmidConfig] = useState<{
    startingVmid: number;
    nextWorkspaceVmid: number;
    templateExists: boolean;
  } | null>(null);
  const [vmidEditMode, setVmidEditMode] = useState(false);
  const [vmidInput, setVmidInput] = useState('');
  const [vmidError, setVmidError] = useState<string | null>(null);
  const [vmidSaving, setVmidSaving] = useState(false);

  const fetchVmidConfig = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/proxmox/vmid-config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVmidConfig(data);
        setVmidInput(String(data.startingVmid));
      }
    } catch {
      // Silently fail - VMID config is optional
    }
  };

  const handleVmidSave = async () => {
    if (!token) return;
    const value = parseInt(vmidInput);
    if (isNaN(value) || value < 100) {
      setVmidError('Minimum VMID is 100');
      return;
    }
    setVmidSaving(true);
    setVmidError(null);
    try {
      const res = await fetch('/api/proxmox/vmid-config', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startingVmid: value }),
      });
      if (!res.ok) {
        const data = await res.json();
        setVmidError(data.error || 'Failed to save');
      } else {
        setVmidEditMode(false);
        await fetchVmidConfig();
      }
    } catch {
      setVmidError('Failed to save VMID configuration');
    }
    setVmidSaving(false);
  };

  useEffect(() => {
    fetchSettings();
    fetchVmidConfig();
  }, [fetchSettings, token]);

  if (error) {
    return (
      <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
        {error}
      </div>
    );
  }

  if (!settings && isLoading) {
    return <div className="text-gray-500 text-sm py-4">Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Connection Section */}
      <Section
        title="Connection"
        defaultOpen={true}
        badge={
          settings?.connection.isConfigured ? (
            <span className="px-2 py-0.5 bg-green-900/50 text-green-400 text-xs rounded">Connected</span>
          ) : (
            <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-400 text-xs rounded">Not configured</span>
          )
        }
      >
        <ConnectionForm
          settings={settings?.connection || null}
          onSave={saveConnectionSettings}
          onTest={testConnection}
          isTesting={isTesting}
          isLoading={isLoading}
        />
      </Section>

      {/* Network Section */}
      <Section title="Network">
        <SimpleSettingsForm
          fields={[
            { key: 'bridge', label: 'Bridge', type: 'text', placeholder: 'vmbr0' },
            { key: 'vlanTag', label: 'VLAN Tag', type: 'number', placeholder: 'No VLAN', min: 1, max: 4094 },
          ]}
          values={{
            bridge: settings?.network?.bridge,
            vlanTag: settings?.network?.vlanTag,
          }}
          onSave={saveNetworkSettings}
          isLoading={isLoading}
        />
      </Section>

      {/* Resources Section */}
      <Section title="Default Resources">
        <SimpleSettingsForm
          fields={[
            { key: 'defaultStorage', label: 'Storage', type: 'text', placeholder: 'local-lvm' },
            { key: 'defaultMemory', label: 'Memory (MB)', type: 'number', placeholder: '2048', min: 256 },
            { key: 'defaultCpuCores', label: 'CPU Cores', type: 'number', placeholder: '2', min: 1 },
          ]}
          values={{
            defaultStorage: settings?.resources?.defaultStorage,
            defaultMemory: settings?.resources?.defaultMemory,
            defaultCpuCores: settings?.resources?.defaultCpuCores,
          }}
          onSave={saveResourceSettings}
          isLoading={isLoading}
        />
      </Section>

      {/* VMID Configuration Section */}
      <Section title="VMID Configuration">
        <div className="space-y-4">
          {vmidConfig ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Template VMID</label>
                  <div className="text-sm text-white">{vmidConfig.startingVmid}</div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Next Workspace VMID</label>
                  <div className="text-sm text-white">{vmidConfig.nextWorkspaceVmid}</div>
                </div>
              </div>

              {vmidEditMode ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">New Starting VMID</label>
                    <input
                      type="number"
                      min="100"
                      value={vmidInput}
                      onChange={(e) => {
                        setVmidInput(e.target.value);
                        setVmidError(null);
                      }}
                      className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Next workspace will use VMID {parseInt(vmidInput) >= 100 ? parseInt(vmidInput) + 1 : '...'}
                    </p>
                  </div>

                  {vmidError && (
                    <div className="p-2 rounded text-sm bg-red-900/30 text-red-400 border border-red-700">
                      {vmidError}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleVmidSave}
                      disabled={vmidSaving}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm text-white"
                    >
                      {vmidSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setVmidEditMode(false);
                        setVmidInput(String(vmidConfig.startingVmid));
                        setVmidError(null);
                      }}
                      disabled={vmidSaving}
                      className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    onClick={() => setVmidEditMode(true)}
                    disabled={vmidConfig.templateExists}
                    className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm text-white"
                  >
                    Edit Starting VMID
                  </button>
                  {vmidConfig.templateExists && (
                    <p className="text-xs text-gray-500 mt-2">
                      VMID can only be changed before creating a template
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-gray-500 text-sm">Loading VMID configuration...</div>
          )}
        </div>
      </Section>

    </div>
  );
}

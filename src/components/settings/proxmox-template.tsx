'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface ProxmoxSettings {
  vlanTag?: number;
  defaultStorage?: string;
  defaultMemory?: number;
  defaultCpuCores?: number;
}

export function ProxmoxTemplate() {
  const { token } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProxmoxBackend, setIsProxmoxBackend] = useState<boolean | null>(null);

  // Settings state
  const [proxmoxSettings, setProxmoxSettings] = useState<ProxmoxSettings>({});
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<ProxmoxSettings>({});

  const fetchStatus = useCallback(async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      setError(null);

      // Fetch template status (to check if proxmox backend) and settings
      const [templateRes, settingsRes] = await Promise.all([
        fetch('/api/proxmox/template', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/proxmox/settings', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const templateData = await templateRes.json();
      const settingsData = await settingsRes.json();

      if (!templateRes.ok) {
        // Check if it's because backend is not proxmox
        if (templateData.error?.includes('Proxmox backend not configured')) {
          setIsProxmoxBackend(false);
          return;
        }
        throw new Error(templateData.error || 'Failed to fetch template status');
      }

      setIsProxmoxBackend(true);

      if (settingsRes.ok) {
        setProxmoxSettings(settingsData);
        setSettingsForm(settingsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch settings');
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

  if (isLoading && isProxmoxBackend === null) {
    return <div className="text-gray-500 text-sm py-4">Loading settings...</div>;
  }

  if (isProxmoxBackend === false) {
    return (
      <div className="text-gray-500 text-sm py-4">
        Proxmox settings are only available when using the Proxmox backend.
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

      {/* Settings Section */}
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
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useTabTemplates, TabTemplate } from '@/hooks/useTabTemplates';
import { useSSHKeys, SSHKeyInfo } from '@/hooks/useSSHKeys';
import { ProxmoxTemplate } from './proxmox-template';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'templates' | 'ssh-keys' | 'proxmox';

const ICON_OPTIONS = [
  { value: 'bot', label: 'Bot', emoji: '\u{1F916}' },
  { value: 'git', label: 'Git', emoji: '\u{1F500}' },
  { value: 'docker', label: 'Docker', emoji: '\u{1F433}' },
  { value: 'terminal', label: 'Terminal', emoji: '\u{1F4BB}' },
  { value: 'code', label: 'Code', emoji: '\u{1F4DD}' },
  { value: 'tool', label: 'Tool', emoji: '\u{1F527}' },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('templates');

  // Tab Templates
  const { templates, fetchTemplates, createTemplate, deleteTemplate, isLoading: templatesLoading } = useTabTemplates();
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', command: '', icon: 'terminal', description: '' });

  // SSH Keys
  const { keys, fetchKeys, generateKey, deleteKey, setDefaultKey, isLoading: keysLoading } = useSSHKeys();
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [keyType, setKeyType] = useState<'ed25519' | 'rsa' | 'ecdsa'>('ed25519');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      fetchKeys();
    }
  }, [isOpen, fetchTemplates, fetchKeys]);

  if (!isOpen) return null;

  const handleAddTemplate = async () => {
    if (!newTemplate.name || !newTemplate.command) return;

    try {
      await createTemplate({
        name: newTemplate.name,
        command: newTemplate.command,
        icon: newTemplate.icon,
        description: newTemplate.description || undefined,
      });
      setNewTemplate({ name: '', command: '', icon: 'terminal', description: '' });
      setShowAddTemplate(false);
    } catch (error) {
      console.error('Failed to create template:', error);
    }
  };

  const handleDeleteTemplate = async (template: TabTemplate) => {
    if (template.isBuiltIn) {
      alert('Cannot delete built-in templates');
      return;
    }
    if (!confirm(`Delete template "${template.name}"?`)) return;

    try {
      await deleteTemplate(template.id);
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleGenerateKey = async () => {
    if (!newKeyName.trim()) return;

    setIsGenerating(true);
    try {
      const key = await generateKey(newKeyName.trim(), keyType);
      setNewKeyName('');
      setShowAddKey(false);
      setExpandedKey(key.id);
    } catch (error) {
      console.error('Failed to generate key:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate key');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteKey = async (key: SSHKeyInfo) => {
    if (!confirm(`Delete SSH key "${key.name}"?`)) return;

    try {
      await deleteKey(key.id);
    } catch (error) {
      console.error('Failed to delete key:', error);
    }
  };

  const handleCopyPublicKey = async (key: SSHKeyInfo) => {
    try {
      await navigator.clipboard.writeText(key.publicKey);
      setCopiedId(key.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const getIconEmoji = (icon: string) => {
    return ICON_OPTIONS.find(o => o.value === icon)?.emoji || '\u{1F4BB}';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'templates'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'}`}
          >
            Tab Templates
          </button>
          <button
            onClick={() => setActiveTab('ssh-keys')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'ssh-keys'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'}`}
          >
            SSH Keys
          </button>
          <button
            onClick={() => setActiveTab('proxmox')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'proxmox'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'}`}
          >
            Proxmox
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Tab Templates */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  Configure which tab types are available when creating new tabs.
                </p>
                <button
                  onClick={() => setShowAddTemplate(!showAddTemplate)}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {showAddTemplate ? 'Cancel' : '+ Add Template'}
                </button>
              </div>

              {/* Add Template Form */}
              {showAddTemplate && (
                <div className="p-4 bg-gray-700/50 rounded space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Name</label>
                      <input
                        type="text"
                        value={newTemplate.name}
                        onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                        placeholder="My Tool"
                        className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Icon</label>
                      <select
                        value={newTemplate.icon}
                        onChange={(e) => setNewTemplate({ ...newTemplate, icon: e.target.value })}
                        className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                      >
                        {ICON_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.emoji} {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Command</label>
                    <input
                      type="text"
                      value={newTemplate.command}
                      onChange={(e) => setNewTemplate({ ...newTemplate, command: e.target.value })}
                      placeholder="/usr/bin/my-tool"
                      className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Description (optional)</label>
                    <input
                      type="text"
                      value={newTemplate.description}
                      onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                      placeholder="What does this tool do?"
                      className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                    />
                  </div>
                  <button
                    onClick={handleAddTemplate}
                    disabled={!newTemplate.name || !newTemplate.command}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-sm text-white"
                  >
                    Add Template
                  </button>
                </div>
              )}

              {/* Templates List */}
              {templatesLoading && templates.length === 0 ? (
                <div className="text-gray-500 text-sm py-4">Loading templates...</div>
              ) : (
                <div className="space-y-2">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center gap-3 p-3 bg-gray-700/30 rounded group"
                    >
                      <span className="text-xl">{getIconEmoji(template.icon)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-medium">{template.name}</span>
                          {template.isBuiltIn && (
                            <span className="text-xs px-1.5 py-0.5 bg-gray-600 text-gray-400 rounded">
                              built-in
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{template.command}</div>
                        {template.description && (
                          <div className="text-xs text-gray-400 mt-0.5">{template.description}</div>
                        )}
                      </div>
                      {!template.isBuiltIn && (
                        <button
                          onClick={() => handleDeleteTemplate(template)}
                          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 px-2"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SSH Keys */}
          {activeTab === 'ssh-keys' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  Manage SSH keys for Git repository authentication.
                </p>
                <button
                  onClick={() => setShowAddKey(!showAddKey)}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {showAddKey ? 'Cancel' : '+ Generate Key'}
                </button>
              </div>

              {/* Generate Key Form */}
              {showAddKey && (
                <div className="p-4 bg-gray-700/50 rounded space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Key Name</label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="github-key"
                      className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={keyType}
                      onChange={(e) => setKeyType(e.target.value as 'ed25519' | 'rsa' | 'ecdsa')}
                      className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                    >
                      <option value="ed25519">Ed25519 (recommended)</option>
                      <option value="rsa">RSA 4096</option>
                      <option value="ecdsa">ECDSA</option>
                    </select>
                    <button
                      onClick={handleGenerateKey}
                      disabled={isGenerating || !newKeyName.trim()}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-sm text-white"
                    >
                      {isGenerating ? 'Generating...' : 'Generate'}
                    </button>
                  </div>
                </div>
              )}

              {/* Keys List */}
              {keysLoading && keys.length === 0 ? (
                <div className="text-gray-500 text-sm py-4">Loading keys...</div>
              ) : keys.length === 0 ? (
                <div className="text-gray-500 text-sm py-4">
                  No SSH keys yet. Generate one to enable SSH cloning.
                </div>
              ) : (
                <div className="space-y-2">
                  {keys.map((key) => (
                    <div key={key.id} className="bg-gray-700/30 rounded">
                      <div
                        onClick={() => setExpandedKey(expandedKey === key.id ? null : key.id)}
                        className="flex items-center gap-3 p-3 cursor-pointer group"
                      >
                        <span className="text-yellow-400">{'\u{1F511}'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white font-medium">{key.name}</span>
                            {key.isDefault && (
                              <span className="text-xs px-1.5 py-0.5 bg-green-600/20 text-green-400 rounded">
                                default
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{key.keyType} &bull; {key.fingerprint}</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteKey(key); }}
                          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 px-2"
                        >
                          &times;
                        </button>
                      </div>

                      {expandedKey === key.id && (
                        <div className="px-3 pb-3 pt-1 border-t border-gray-700/50">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-400">Public Key</span>
                            <div className="flex gap-2">
                              {!key.isDefault && (
                                <button
                                  onClick={() => setDefaultKey(key.id)}
                                  className="text-xs text-blue-400 hover:text-blue-300"
                                >
                                  Set Default
                                </button>
                              )}
                              <button
                                onClick={() => handleCopyPublicKey(key)}
                                className="text-xs text-blue-400 hover:text-blue-300"
                              >
                                {copiedId === key.id ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                          </div>
                          <div className="font-mono text-xs text-gray-300 break-all bg-gray-900/50 p-2 rounded max-h-20 overflow-y-auto">
                            {key.publicKey}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Proxmox */}
          {activeTab === 'proxmox' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Manage the Proxmox LXC template used for creating workspaces.
              </p>
              <ProxmoxTemplate />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

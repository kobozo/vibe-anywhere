'use client';

import { useState, useEffect } from 'react';
import { useTabTemplates, TabTemplate } from '@/hooks/useTabTemplates';
import { useSSHKeys, SSHKeyInfo } from '@/hooks/useSSHKeys';
import { useSecrets, type Secret } from '@/hooks/useSecrets';
import { ProxmoxSettings } from './proxmox-settings';
import { VoiceSettings } from './voice-settings';
import { ThemeSettings } from './theme-settings';
import { GitIdentityList } from '@/components/git-identity/git-identity-list';
import { getTemplateIcon } from '@/components/icons/ai-icons';
import { MATERIAL_ICONS, getMaterialIcon } from '@/components/icons/material-icons';
import { getStacksByCategory, type TechStack } from '@/lib/container/proxmox/tech-stacks';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVoiceSettingsChange?: () => void;
}

type SettingsTab = 'theme' | 'templates' | 'ssh-keys' | 'git-identities' | 'secrets' | 'proxmox' | 'voice';

// Get AI assistant tech stacks for the dropdown
const AI_TECH_STACKS: TechStack[] = getStacksByCategory('ai-assistant');

export function SettingsModal({ isOpen, onClose, onVoiceSettingsChange }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('theme');

  // Tab Templates
  const { templates, fetchTemplates, createTemplate, deleteTemplate, isLoading: templatesLoading } = useTabTemplates();
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    command: '',
    icon: 'terminal',
    description: '',
    exitOnClose: true,
    requiredTechStack: '' as string | null, // Empty string means no filter
  });

  // SSH Keys
  const { keys, fetchKeys, generateKey, deleteKey, setDefaultKey, isLoading: keysLoading } = useSSHKeys();
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [keyType, setKeyType] = useState<'ed25519' | 'rsa' | 'ecdsa'>('ed25519');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Secrets
  const { secrets, fetchSecrets, createSecret, updateSecret, deleteSecret, isLoading: secretsLoading } = useSecrets();
  const [showAddSecret, setShowAddSecret] = useState(false);
  const [newSecret, setNewSecret] = useState({
    name: '',
    envKey: '',
    value: '',
    description: '',
    templateWhitelist: [] as string[],
  });
  const [isSavingSecret, setIsSavingSecret] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      fetchKeys();
      fetchSecrets();
    }
  }, [isOpen, fetchTemplates, fetchKeys, fetchSecrets]);

  if (!isOpen) return null;

  const handleAddTemplate = async () => {
    if (!newTemplate.name || !newTemplate.command) return;

    try {
      await createTemplate({
        name: newTemplate.name,
        command: newTemplate.command,
        icon: newTemplate.icon,
        description: newTemplate.description || undefined,
        exitOnClose: newTemplate.exitOnClose,
        requiredTechStack: newTemplate.requiredTechStack || null,
      });
      setNewTemplate({ name: '', command: '', icon: 'terminal', description: '', exitOnClose: true, requiredTechStack: '' });
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
      if (!navigator.clipboard) {
        throw new Error('Clipboard API not available. Please use HTTPS or localhost.');
      }
      await navigator.clipboard.writeText(key.publicKey);
      setCopiedId(key.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleAddSecret = async () => {
    if (!newSecret.name || !newSecret.envKey || !newSecret.value) return;

    setIsSavingSecret(true);
    try {
      await createSecret({
        name: newSecret.name,
        envKey: newSecret.envKey,
        value: newSecret.value,
        description: newSecret.description || undefined,
        templateWhitelist: newSecret.templateWhitelist,
      });
      setNewSecret({ name: '', envKey: '', value: '', description: '', templateWhitelist: [] });
      setShowAddSecret(false);
    } catch (error) {
      console.error('Failed to create secret:', error);
      alert(error instanceof Error ? error.message : 'Failed to create secret');
    } finally {
      setIsSavingSecret(false);
    }
  };

  const handleDeleteSecret = async (secret: Secret) => {
    if (!confirm(`Delete secret "${secret.name}"?\n\nThis will remove it from all repositories that reference it.`)) return;

    try {
      await deleteSecret(secret.id);
    } catch (error) {
      console.error('Failed to delete secret:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete secret');
    }
  };

  const handleToggleTemplate = (template: string) => {
    setNewSecret(prev => ({
      ...prev,
      templateWhitelist: prev.templateWhitelist.includes(template)
        ? prev.templateWhitelist.filter(t => t !== template)
        : [...prev.templateWhitelist, template]
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
          <button onClick={onClose} className="text-foreground-secondary hover:text-foreground text-xl">
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('theme')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'theme'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-secondary hover:text-foreground'}`}
          >
            Theme
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'templates'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-secondary hover:text-foreground'}`}
          >
            Tab Templates
          </button>
          <button
            onClick={() => setActiveTab('ssh-keys')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'ssh-keys'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-secondary hover:text-foreground'}`}
          >
            SSH Keys
          </button>
          <button
            onClick={() => setActiveTab('git-identities')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'git-identities'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-secondary hover:text-foreground'}`}
          >
            Git Identities
          </button>
          <button
            onClick={() => setActiveTab('secrets')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'secrets'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-secondary hover:text-foreground'}`}
          >
            Secrets
          </button>
          <button
            onClick={() => setActiveTab('proxmox')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'proxmox'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-secondary hover:text-foreground'}`}
          >
            Proxmox
          </button>
          <button
            onClick={() => setActiveTab('voice')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'voice'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-secondary hover:text-foreground'}`}
          >
            Voice
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Theme */}
          {activeTab === 'theme' && <ThemeSettings />}

          {/* Tab Templates */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-foreground-secondary">
                  Configure which tab types are available when creating new tabs.
                </p>
                <button
                  onClick={() => setShowAddTemplate(!showAddTemplate)}
                  className="text-sm text-primary hover:text-primary-hover"
                >
                  {showAddTemplate ? 'Cancel' : '+ Add Template'}
                </button>
              </div>

              {/* Add Template Form */}
              {showAddTemplate && (
                <div className="p-4 bg-background-tertiary/50 rounded space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-foreground-secondary mb-1">Name</label>
                      <input
                        type="text"
                        value={newTemplate.name}
                        onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                        placeholder="My Tool"
                        className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-foreground-secondary mb-1">Icon</label>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const IconComponent = getMaterialIcon(newTemplate.icon);
                          return <IconComponent className="w-5 h-5 text-foreground" />;
                        })()}
                        <select
                          value={newTemplate.icon}
                          onChange={(e) => setNewTemplate({ ...newTemplate, icon: e.target.value })}
                          className="flex-1 px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground"
                        >
                          {MATERIAL_ICONS.map((icon) => (
                            <option key={icon.value} value={icon.value}>
                              {icon.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-secondary mb-1">Command</label>
                    <input
                      type="text"
                      value={newTemplate.command}
                      onChange={(e) => setNewTemplate({ ...newTemplate, command: e.target.value })}
                      placeholder="/usr/bin/my-tool"
                      className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-secondary mb-1">Description (optional)</label>
                    <input
                      type="text"
                      value={newTemplate.description}
                      onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                      placeholder="What does this tool do?"
                      className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-secondary mb-1">
                      Required Tech Stack <span className="text-foreground-tertiary">(optional)</span>
                    </label>
                    <select
                      value={newTemplate.requiredTechStack ?? ''}
                      onChange={(e) => setNewTemplate({ ...newTemplate, requiredTechStack: e.target.value || null })}
                      className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground"
                    >
                      <option value="">Always show (no filter)</option>
                      {AI_TECH_STACKS.map((stack) => (
                        <option key={stack.id} value={stack.id}>
                          {stack.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-foreground-tertiary mt-1">
                      Only show this template when the selected AI is in the workspace tech stack
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="exitOnClose"
                      checked={newTemplate.exitOnClose}
                      onChange={(e) => setNewTemplate({ ...newTemplate, exitOnClose: e.target.checked })}
                      className="w-4 h-4 rounded border-border-secondary bg-background-tertiary text-primary"
                    />
                    <label htmlFor="exitOnClose" className="text-sm text-foreground">
                      Exit on close
                    </label>
                    <span className="text-xs text-foreground-tertiary">
                      (close tab when command exits)
                    </span>
                  </div>
                  <button
                    onClick={handleAddTemplate}
                    disabled={!newTemplate.name || !newTemplate.command}
                    className="px-3 py-1.5 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 rounded text-sm text-primary-foreground"
                  >
                    Add Template
                  </button>
                </div>
              )}

              {/* Templates List */}
              {templatesLoading && templates.length === 0 ? (
                <div className="text-foreground-tertiary text-sm py-4">Loading templates...</div>
              ) : (
                <div className="space-y-2">
                  {templates.map((template) => (
                      <div
                        key={template.id}
                        className="flex items-center gap-3 p-3 bg-background-tertiary/30 rounded group"
                      >
                        <div className="w-6 h-6 flex-shrink-0">
                          {getTemplateIcon(template.icon, template.isBuiltIn, 'w-6 h-6 text-foreground')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-foreground font-medium">{template.name}</span>
                            {template.isBuiltIn && (
                              <span className="text-xs px-1.5 py-0.5 bg-background-input text-foreground-secondary rounded">
                                built-in
                              </span>
                            )}
                            {template.exitOnClose && (
                              <span className="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded">
                                exit on close
                              </span>
                            )}
                            {template.requiredTechStack && (
                              <span className="text-xs px-1.5 py-0.5 bg-warning/20 text-warning rounded">
                                requires: {template.requiredTechStack}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-foreground-tertiary truncate">{template.command}</div>
                          {template.description && (
                            <div className="text-xs text-foreground-secondary mt-0.5">{template.description}</div>
                          )}
                        </div>
                        {!template.isBuiltIn && (
                          <button
                            onClick={() => handleDeleteTemplate(template)}
                            className="opacity-0 group-hover:opacity-100 text-foreground-tertiary hover:text-error px-2"
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
                <p className="text-sm text-foreground-secondary">
                  Manage SSH keys for Git repository authentication.
                </p>
                <button
                  onClick={() => setShowAddKey(!showAddKey)}
                  className="text-sm text-primary hover:text-primary-hover"
                >
                  {showAddKey ? 'Cancel' : '+ Generate Key'}
                </button>
              </div>

              {/* Generate Key Form */}
              {showAddKey && (
                <div className="p-4 bg-background-tertiary/50 rounded space-y-3">
                  <div>
                    <label className="block text-xs text-foreground-secondary mb-1">Key Name</label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="github-key"
                      className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={keyType}
                      onChange={(e) => setKeyType(e.target.value as 'ed25519' | 'rsa' | 'ecdsa')}
                      className="px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground"
                    >
                      <option value="ed25519">Ed25519 (recommended)</option>
                      <option value="rsa">RSA 4096</option>
                      <option value="ecdsa">ECDSA</option>
                    </select>
                    <button
                      onClick={handleGenerateKey}
                      disabled={isGenerating || !newKeyName.trim()}
                      className="px-3 py-1.5 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 rounded text-sm text-primary-foreground"
                    >
                      {isGenerating ? 'Generating...' : 'Generate'}
                    </button>
                  </div>
                </div>
              )}

              {/* Keys List */}
              {keysLoading && keys.length === 0 ? (
                <div className="text-foreground-tertiary text-sm py-4">Loading keys...</div>
              ) : keys.length === 0 ? (
                <div className="text-foreground-tertiary text-sm py-4">
                  No SSH keys yet. Generate one to enable SSH cloning.
                </div>
              ) : (
                <div className="space-y-2">
                  {keys.map((key) => (
                    <div key={key.id} className="bg-background-tertiary/30 rounded">
                      <div
                        onClick={() => setExpandedKey(expandedKey === key.id ? null : key.id)}
                        className="flex items-center gap-3 p-3 cursor-pointer group"
                      >
                        <span className="text-warning">{'\u{1F511}'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-foreground font-medium">{key.name}</span>
                            {key.isDefault && (
                              <span className="text-xs px-1.5 py-0.5 bg-success/20 text-success rounded">
                                default
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-foreground-tertiary">{key.keyType} &bull; {key.fingerprint}</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteKey(key); }}
                          className="opacity-0 group-hover:opacity-100 text-foreground-tertiary hover:text-error px-2"
                        >
                          &times;
                        </button>
                      </div>

                      {expandedKey === key.id && (
                        <div className="px-3 pb-3 pt-1 border-t border-border/50">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-foreground-secondary">Public Key</span>
                            <div className="flex gap-2">
                              {!key.isDefault && (
                                <button
                                  onClick={() => setDefaultKey(key.id)}
                                  className="text-xs text-primary hover:text-primary-hover"
                                >
                                  Set Default
                                </button>
                              )}
                              <button
                                onClick={() => handleCopyPublicKey(key)}
                                className="text-xs text-primary hover:text-primary-hover"
                              >
                                {copiedId === key.id ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                          </div>
                          <div className="font-mono text-xs text-foreground break-all bg-background/50 p-2 rounded max-h-20 overflow-y-auto">
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

          {/* Git Identities */}
          {activeTab === 'git-identities' && (
            <GitIdentityList />
          )}

          {/* Secrets */}
          {activeTab === 'secrets' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-foreground-secondary">
                  Manage secret environment variables that can be injected into specific tab types.
                </p>
                <button
                  onClick={() => setShowAddSecret(!showAddSecret)}
                  className="text-sm text-primary hover:text-primary-hover"
                >
                  {showAddSecret ? 'Cancel' : '+ Add Secret'}
                </button>
              </div>

              {/* Add Secret Form */}
              {showAddSecret && (
                <div className="p-4 bg-background-tertiary/50 rounded space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-foreground-secondary mb-1">Name *</label>
                      <input
                        type="text"
                        value={newSecret.name}
                        onChange={(e) => setNewSecret({ ...newSecret, name: e.target.value })}
                        placeholder="Anthropic API Key"
                        className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-foreground-secondary mb-1">Environment Key *</label>
                      <input
                        type="text"
                        value={newSecret.envKey}
                        onChange={(e) => setNewSecret({ ...newSecret, envKey: e.target.value.toUpperCase() })}
                        placeholder="ANTHROPIC_API_KEY"
                        className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-secondary mb-1">Value *</label>
                    <input
                      type="password"
                      value={newSecret.value}
                      onChange={(e) => setNewSecret({ ...newSecret, value: e.target.value })}
                      placeholder="sk-ant-..."
                      className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-secondary mb-1">Description (optional)</label>
                    <input
                      type="text"
                      value={newSecret.description}
                      onChange={(e) => setNewSecret({ ...newSecret, description: e.target.value })}
                      placeholder="Production API key"
                      className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-secondary mb-2">
                      Tab Templates * <span className="text-foreground-tertiary">(select at least one)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {templates.map((template) => (
                        <label key={template.id} className="flex items-center gap-2 p-2 bg-background-tertiary/50 rounded cursor-pointer hover:bg-background-tertiary">
                          <input
                            type="checkbox"
                            checked={newSecret.templateWhitelist.includes(template.icon)}
                            onChange={() => handleToggleTemplate(template.icon)}
                            className="w-4 h-4 rounded border-border-secondary bg-background-tertiary text-primary"
                          />
                          <div className="w-5 h-5 flex-shrink-0">
                            {getTemplateIcon(template.icon, template.isBuiltIn, 'w-5 h-5 text-foreground')}
                          </div>
                          <span className="text-sm text-foreground">{template.name}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-foreground-tertiary mt-1">
                      Secret will only be injected in tabs matching these templates
                    </p>
                  </div>
                  <button
                    onClick={handleAddSecret}
                    disabled={isSavingSecret || !newSecret.name || !newSecret.envKey || !newSecret.value || newSecret.templateWhitelist.length === 0}
                    className="px-3 py-1.5 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 rounded text-sm text-primary-foreground"
                  >
                    {isSavingSecret ? 'Adding...' : 'Add Secret'}
                  </button>
                </div>
              )}

              {/* Secrets List */}
              {secretsLoading && secrets.length === 0 ? (
                <div className="text-foreground-tertiary text-sm py-4">Loading secrets...</div>
              ) : secrets.length === 0 ? (
                <div className="text-foreground-tertiary text-sm py-4">
                  No secrets yet. Add one to inject environment variables into specific tab types.
                </div>
              ) : (
                <div className="space-y-2">
                  {secrets.map((secret) => (
                    <div
                      key={secret.id}
                      className="flex items-start gap-3 p-3 bg-background-tertiary/30 rounded group"
                    >
                      <span className="text-warning text-xl mt-0.5">{'\u{1F511}'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-foreground font-medium">{secret.name}</span>
                          <span className="text-xs px-1.5 py-0.5 bg-background-input text-foreground-secondary rounded font-mono">
                            {secret.envKey}
                          </span>
                        </div>
                        {secret.description && (
                          <div className="text-xs text-foreground-secondary mt-0.5">{secret.description}</div>
                        )}
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className="text-xs text-foreground-tertiary">Templates:</span>
                          {secret.templateWhitelist.map((templateIcon) => {
                            const template = templates.find(t => t.icon === templateIcon);
                            return template ? (
                              <span key={templateIcon} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded">
                                <div className="w-3 h-3">
                                  {getTemplateIcon(template.icon, template.isBuiltIn, 'w-3 h-3')}
                                </div>
                                {template.name}
                              </span>
                            ) : (
                              <span key={templateIcon} className="text-xs px-1.5 py-0.5 bg-warning/20 text-warning rounded">
                                {templateIcon}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteSecret(secret)}
                        className="opacity-0 group-hover:opacity-100 text-foreground-tertiary hover:text-error px-2"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Proxmox */}
          {activeTab === 'proxmox' && (
            <ProxmoxSettings />
          )}

          {/* Voice (Whisper) */}
          {activeTab === 'voice' && <VoiceSettings onSettingsChange={onVoiceSettingsChange} />}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-background-tertiary hover:bg-background-input rounded text-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

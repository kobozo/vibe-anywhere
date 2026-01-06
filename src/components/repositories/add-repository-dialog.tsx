'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSSHKeys, SSHKeyInfo } from '@/hooks/useSSHKeys';
import { useAuth } from '@/hooks/useAuth';
import type { ProxmoxTemplate } from '@/lib/db/schema';

interface TechStackInfo {
  id: string;
  name: string;
  description: string;
  requiresNesting?: boolean;
}

interface AddRepositoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onClone: (name: string, url: string, description?: string, sshKeyId?: string, techStack?: string[], templateId?: string, cloneDepth?: number) => Promise<void>;
  isLoading: boolean;
  templates?: ProxmoxTemplate[];
}

type CloneDepthOption = 'full' | 'shallow' | 'recent';

export function AddRepositoryDialog({
  isOpen,
  onClose,
  onClone,
  isLoading,
  templates = [],
}: AddRepositoryDialogProps) {
  const { token } = useAuth();
  const { keys, fetchKeys, generateKey } = useSSHKeys();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneDepth, setCloneDepth] = useState<CloneDepthOption>('shallow');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // SSH key generation state
  const [showGenerateKey, setShowGenerateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyType, setNewKeyType] = useState<'ed25519' | 'rsa' | 'ecdsa'>('ed25519');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<SSHKeyInfo | null>(null);
  const [copied, setCopied] = useState(false);

  // Tech stack state
  const [availableTechStacks, setAvailableTechStacks] = useState<TechStackInfo[]>([]);
  const [templateTechStacks, setTemplateTechStacks] = useState<string[]>([]);
  const [selectedTechStacks, setSelectedTechStacks] = useState<string[]>([]);

  // Fetch tech stacks
  const fetchTechStacks = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/tech-stacks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableTechStacks(data.stacks || []);
        setTemplateTechStacks(data.templateStacks || []);
      }
    } catch (err) {
      console.error('Failed to fetch tech stacks:', err);
    }
  }, [token]);

  // Fetch SSH keys and tech stacks when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchKeys();
      fetchTechStacks();
    }
  }, [isOpen, fetchKeys, fetchTechStacks]);

  // Auto-select default key
  useEffect(() => {
    const defaultKey = keys.find(k => k.isDefault);
    if (defaultKey && !selectedKeyId) {
      setSelectedKeyId(defaultKey.id);
    }
  }, [keys, selectedKeyId]);

  // Auto-select default template
  useEffect(() => {
    if (templates.length > 0 && !selectedTemplateId) {
      const defaultTemplate = templates.find(t => t.isDefault && t.status === 'ready');
      const firstReady = templates.find(t => t.status === 'ready');
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
      } else if (firstReady) {
        setSelectedTemplateId(firstReady.id);
      }
    }
  }, [templates, selectedTemplateId]);

  if (!isOpen) return null;

  const isSSHUrl = cloneUrl.startsWith('git@') || cloneUrl.includes('ssh://');

  const getCloneDepthValue = (): number | undefined => {
    switch (cloneDepth) {
      case 'shallow': return 1;
      case 'recent': return 10;
      case 'full': return undefined;
      default: return 1;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!cloneUrl) {
      setError('Please enter a clone URL');
      return;
    }

    try {
      // Filter out tech stacks already in template
      const techStacksToInstall = selectedTechStacks.filter(
        id => !templateTechStacks.includes(id)
      );

      const templateIdToUse = selectedTemplateId || undefined;
      const keyId = isSSHUrl ? selectedKeyId || undefined : undefined;

      await onClone(
        name,
        cloneUrl,
        description || undefined,
        keyId,
        techStacksToInstall.length > 0 ? techStacksToInstall : undefined,
        templateIdToUse,
        getCloneDepthValue()
      );

      // Reset form
      setName('');
      setDescription('');
      setCloneUrl('');
      setCloneDepth('shallow');
      setSelectedKeyId('');
      setSelectedTemplateId('');
      setSelectedTechStacks([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add repository');
    }
  };

  const toggleTechStack = (stackId: string) => {
    setSelectedTechStacks(prev =>
      prev.includes(stackId)
        ? prev.filter(id => id !== stackId)
        : [...prev, stackId]
    );
  };

  // Auto-extract name from clone URL
  const handleCloneUrlChange = (url: string) => {
    setCloneUrl(url);
    if (!name) {
      const match = url.match(/\/([^\/]+?)(\.git)?$/);
      if (match) {
        setName(match[1]);
      }
    }
  };

  // Handle SSH key generation
  const handleGenerateKey = async () => {
    if (!newKeyName.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const key = await generateKey(newKeyName.trim(), newKeyType);
      setSelectedKeyId(key.id);
      setGeneratedKey(key);
      setNewKeyName('');
      setNewKeyType('ed25519');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate SSH key');
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy public key to clipboard
  const handleCopyPublicKey = async (publicKey?: string) => {
    const keyToCopy = publicKey || generatedKey?.publicKey;
    if (!keyToCopy) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(keyToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = keyToCopy;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const selectedKey = keys.find(k => k.id === selectedKeyId);

  const handleDismissGeneratedKey = () => {
    setGeneratedKey(null);
    setShowGenerateKey(false);
    setCopied(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Add Repository</h2>
            <button
              onClick={onClose}
              className="text-foreground-secondary hover:text-foreground"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-error/20 border border-error/50 rounded text-error text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-foreground mb-1">
              Repository URL <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={cloneUrl}
              onChange={(e) => handleCloneUrlChange(e.target.value)}
              placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary"
            />
          </div>

          {/* Clone Depth Selection */}
          <div>
            <label className="block text-sm text-foreground mb-1">
              Clone Depth
            </label>
            <select
              value={cloneDepth}
              onChange={(e) => setCloneDepth(e.target.value as CloneDepthOption)}
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground"
            >
              <option value="shallow">Shallow clone (depth=1) - Fastest startup</option>
              <option value="recent">Recent history (depth=10) - For recent blame/log</option>
              <option value="full">Full clone - Complete git history</option>
            </select>
            <p className="text-xs text-foreground-tertiary mt-1">
              Shallow clones are faster but have limited git history. Use full clone for bisect/blame.
            </p>
          </div>

          {/* SSH Key selection - only show for SSH URLs */}
          {isSSHUrl && (
            <div>
              <label className="block text-sm text-foreground mb-1">
                SSH Key
              </label>
              {generatedKey ? (
                <div className="space-y-3">
                  <div className="p-3 bg-success/20 border border-success/50 rounded text-success text-sm">
                    Key "{generatedKey.name}" generated successfully!
                  </div>
                  <div className="p-3 bg-background-tertiary/50 rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-foreground-secondary">Public Key (copy this to GitHub)</span>
                      <button
                        type="button"
                        onClick={() => handleCopyPublicKey()}
                        className="text-xs text-primary hover:text-primary-hover"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div className="font-mono text-xs text-foreground break-all bg-gray-900/50 p-2 rounded max-h-20 overflow-y-auto">
                      {generatedKey.publicKey}
                    </div>
                    <button
                      type="button"
                      onClick={handleDismissGeneratedKey}
                      className="w-full mt-2 px-3 py-1.5 bg-background-input hover:bg-background-tertiary rounded text-sm text-foreground"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : keys.length > 0 ? (
                <>
                  <select
                    value={selectedKeyId}
                    onChange={(e) => { setSelectedKeyId(e.target.value); setCopied(false); }}
                    className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground"
                  >
                    <option value="">Select SSH key...</option>
                    {keys.map((key) => (
                      <option key={key.id} value={key.id}>
                        {key.name} ({key.keyType}){key.isDefault ? ' - default' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-3 mt-2">
                    {selectedKey && (
                      <button
                        type="button"
                        onClick={() => handleCopyPublicKey(selectedKey.publicKey)}
                        className="text-sm text-primary hover:text-primary-hover"
                      >
                        {copied ? 'Copied!' : 'Copy public key'}
                      </button>
                    )}
                    {!showGenerateKey && (
                      <button
                        type="button"
                        onClick={() => setShowGenerateKey(true)}
                        className="text-sm text-primary hover:text-primary-hover"
                      >
                        + Generate new key
                      </button>
                    )}
                  </div>
                  {showGenerateKey && (
                    <div className="mt-3 p-3 bg-background-tertiary/50 rounded space-y-3">
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
                          value={newKeyType}
                          onChange={(e) => setNewKeyType(e.target.value as 'ed25519' | 'rsa' | 'ecdsa')}
                          className="px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground"
                        >
                          <option value="ed25519">Ed25519 (recommended)</option>
                          <option value="rsa">RSA 4096</option>
                          <option value="ecdsa">ECDSA</option>
                        </select>
                        <button
                          type="button"
                          onClick={handleGenerateKey}
                          disabled={isGenerating || !newKeyName.trim()}
                          className="px-3 py-1.5 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 rounded text-sm text-foreground"
                        >
                          {isGenerating ? 'Generating...' : 'Generate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowGenerateKey(false);
                            setNewKeyName('');
                          }}
                          className="text-sm text-foreground-secondary hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-warning/20 border border-warning/50 rounded text-warning text-sm">
                    No SSH keys found. Generate one to use SSH cloning:
                  </div>
                  <div className="p-3 bg-background-tertiary/50 rounded space-y-3">
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
                        value={newKeyType}
                        onChange={(e) => setNewKeyType(e.target.value as 'ed25519' | 'rsa' | 'ecdsa')}
                        className="px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground"
                      >
                        <option value="ed25519">Ed25519 (recommended)</option>
                        <option value="rsa">RSA 4096</option>
                        <option value="ecdsa">ECDSA</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleGenerateKey}
                        disabled={isGenerating || !newKeyName.trim()}
                        className="px-3 py-1.5 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 rounded text-sm text-foreground"
                      >
                        {isGenerating ? 'Generating...' : 'Generate'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm text-foreground mb-1">
              Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              required
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary"
            />
          </div>

          <div>
            <label className="block text-sm text-foreground mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary"
            />
          </div>

          {/* Template Selection */}
          {templates.length > 0 && (
            <div>
              <label className="block text-sm text-foreground mb-1">
                Template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground"
              >
                <option value="">Use default template</option>
                {templates.map((template) => (
                  <option
                    key={template.id}
                    value={template.id}
                    disabled={template.status !== 'ready'}
                  >
                    {template.name}
                    {template.status !== 'ready' && ` (${template.status})`}
                    {template.isDefault && ' - Default'}
                  </option>
                ))}
              </select>
              {selectedTemplateId && (() => {
                const selected = templates.find(t => t.id === selectedTemplateId);
                return selected?.techStacks && selected.techStacks.length > 0 && (
                  <p className="text-xs text-foreground-tertiary mt-1">
                    Includes: {selected.techStacks.join(', ')}
                  </p>
                );
              })()}
            </div>
          )}

          {/* Tech Stack Selection */}
          {availableTechStacks.length > 0 && (
            <div>
              <label className="block text-sm text-foreground mb-2">
                Tech Stack
              </label>
              <p className="text-xs text-foreground-tertiary mb-2">
                Select development tools to install on workspaces created from this repository.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {availableTechStacks.map((stack) => {
                  const isInTemplate = templateTechStacks.includes(stack.id);
                  const isSelected = selectedTechStacks.includes(stack.id);

                  return (
                    <label
                      key={stack.id}
                      className={`flex items-start gap-2 p-2 rounded cursor-pointer transition-colors ${
                        isInTemplate
                          ? 'bg-success/10 border border-success/30 cursor-default'
                          : isSelected
                          ? 'bg-primary/20 border border-primary/50'
                          : 'bg-background-tertiary/50 border border-border-secondary/50 hover:bg-background-tertiary'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected || isInTemplate}
                        onChange={() => !isInTemplate && toggleTechStack(stack.id)}
                        disabled={isInTemplate}
                        className="mt-0.5 rounded border-border bg-background-tertiary text-primary focus:ring-primary disabled:opacity-50"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground flex items-center gap-1">
                          {stack.name}
                          {isInTemplate && (
                            <span className="text-xs text-success">(in template)</span>
                          )}
                        </div>
                        <div className="text-xs text-foreground-secondary truncate">{stack.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              {templateTechStacks.length > 0 && (
                <p className="text-xs text-foreground-tertiary mt-2">
                  Stacks marked "in template" are already pre-installed and will be available immediately.
                </p>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-foreground-secondary hover:text-foreground transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !name || !cloneUrl}
            className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 disabled:cursor-not-allowed rounded text-foreground transition-colors"
          >
            {isLoading ? 'Adding...' : 'Add Repository'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSSHKeys, SSHKeyInfo } from '@/hooks/useSSHKeys';
import { useGitIdentities } from '@/hooks/useGitIdentities';
import { useAuth } from '@/hooks/useAuth';
import { useProxmoxSettings } from '@/hooks/useProxmoxSettings';
import { WizardStepper, WizardNavigation } from '@/components/ui/wizard-stepper';
import {
  GitIdentitySelector,
  isGitIdentityValid,
  type GitIdentityValue,
} from '@/components/git-identity/git-identity-selector';
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
  onClone: (
    name: string,
    url: string,
    description?: string,
    sshKeyId?: string,
    techStack?: string[],
    templateId?: string,
    cloneDepth?: number,
    resourceMemory?: number | null,
    resourceCpuCores?: number | null,
    resourceDiskSize?: number | null,
    gitIdentityId?: string | null,
    gitCustomName?: string | null,
    gitCustomEmail?: string | null
  ) => Promise<void>;
  isLoading: boolean;
  templates?: ProxmoxTemplate[];
}

type WizardStepId = 'repository' | 'container' | 'git-identity';
type CloneDepthOption = 'full' | 'shallow' | 'recent';

const WIZARD_STEPS = [
  { id: 'repository' as const, label: 'Repository' },
  { id: 'container' as const, label: 'Container' },
  { id: 'git-identity' as const, label: 'Git Identity' },
];

export function AddRepositoryDialog({
  isOpen,
  onClose,
  onClone,
  isLoading,
  templates = [],
}: AddRepositoryDialogProps) {
  const { token } = useAuth();
  const { keys, fetchKeys, generateKey } = useSSHKeys();
  const { identities: gitIdentities, fetchIdentities: fetchGitIdentities } = useGitIdentities();
  const { settings: proxmoxSettings, fetchSettings: fetchProxmoxSettings } = useProxmoxSettings();

  // Wizard state
  const [activeStep, setActiveStep] = useState<WizardStepId>('repository');
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStepId>>(new Set());

  // Step 1: Repository fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneDepth, setCloneDepth] = useState<CloneDepthOption>('shallow');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');

  // Step 2: Container fields
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [availableTechStacks, setAvailableTechStacks] = useState<TechStackInfo[]>([]);
  const [templateTechStacks, setTemplateTechStacks] = useState<string[]>([]);
  const [selectedTechStacks, setSelectedTechStacks] = useState<string[]>([]);
  const [resourceMemory, setResourceMemory] = useState<string>('');
  const [resourceCpuCores, setResourceCpuCores] = useState<string>('');
  const [resourceDiskSize, setResourceDiskSize] = useState<string>('');

  // Step 3: Git identity
  const [gitIdentity, setGitIdentity] = useState<GitIdentityValue>({ mode: 'saved' });

  // SSH key generation state
  const [showGenerateKey, setShowGenerateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyType, setNewKeyType] = useState<'ed25519' | 'rsa' | 'ecdsa'>('ed25519');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<SSHKeyInfo | null>(null);
  const [copied, setCopied] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

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

  // Fetch data when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchKeys();
      fetchTechStacks();
      fetchGitIdentities();
      fetchProxmoxSettings();
      // Reset wizard state
      setActiveStep('repository');
      setCompletedSteps(new Set());
      setError(null);
    }
  }, [isOpen, fetchKeys, fetchTechStacks, fetchGitIdentities, fetchProxmoxSettings]);

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

  // Step validation
  const isStep1Valid = (): boolean => !!cloneUrl && !!name;
  const isStep2Valid = (): boolean => true;
  const isStep3Valid = (): boolean => isGitIdentityValid(gitIdentity, gitIdentities);

  const canProceed = (): boolean => {
    switch (activeStep) {
      case 'repository': return isStep1Valid();
      case 'container': return isStep2Valid();
      case 'git-identity': return isStep3Valid();
      default: return false;
    }
  };

  // Navigation handlers
  const handleNext = () => {
    if (activeStep === 'repository' && isStep1Valid()) {
      setCompletedSteps((prev) => new Set(prev).add('repository'));
      setActiveStep('container');
    } else if (activeStep === 'container' && isStep2Valid()) {
      setCompletedSteps((prev) => new Set(prev).add('container'));
      setActiveStep('git-identity');
    }
  };

  const handleBack = () => {
    if (activeStep === 'container') setActiveStep('repository');
    else if (activeStep === 'git-identity') setActiveStep('container');
  };

  const handleStepClick = (stepId: string) => {
    const step = stepId as WizardStepId;
    const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === step);
    const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === activeStep);
    if (completedSteps.has(step) || stepIndex < currentIndex) {
      setActiveStep(step);
    }
  };

  const getCloneDepthValue = (): number | undefined => {
    switch (cloneDepth) {
      case 'shallow': return 1;
      case 'recent': return 10;
      case 'full': return undefined;
      default: return 1;
    }
  };

  const handleSubmit = async () => {
    setError(null);

    try {
      const techStacksToInstall = selectedTechStacks.filter(
        id => !templateTechStacks.includes(id)
      );

      const templateIdToUse = selectedTemplateId || undefined;
      const keyId = isSSHUrl ? selectedKeyId || undefined : undefined;
      const memoryValue = resourceMemory ? parseInt(resourceMemory, 10) : null;
      const cpuValue = resourceCpuCores ? parseInt(resourceCpuCores, 10) : null;
      const diskValue = resourceDiskSize ? parseInt(resourceDiskSize, 10) : null;

      let gitIdentityId: string | null = null;
      let gitCustomName: string | null = null;
      let gitCustomEmail: string | null = null;

      if (gitIdentity.mode === 'saved' && gitIdentity.identityId) {
        gitIdentityId = gitIdentity.identityId;
      } else if (gitIdentity.mode === 'custom' && gitIdentity.customName && gitIdentity.customEmail) {
        gitCustomName = gitIdentity.customName;
        gitCustomEmail = gitIdentity.customEmail;
      }

      await onClone(
        name, cloneUrl, description || undefined, keyId,
        techStacksToInstall.length > 0 ? techStacksToInstall : undefined,
        templateIdToUse, getCloneDepthValue(), memoryValue, cpuValue, diskValue,
        gitIdentityId, gitCustomName, gitCustomEmail
      );

      // Reset form
      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add repository');
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setCloneUrl('');
    setCloneDepth('shallow');
    setSelectedKeyId('');
    setSelectedTemplateId('');
    setSelectedTechStacks([]);
    setResourceMemory('');
    setResourceCpuCores('');
    setResourceDiskSize('');
    setGitIdentity({ mode: 'saved' });
    setActiveStep('repository');
    setCompletedSteps(new Set());
    setShowGenerateKey(false);
    setNewKeyName('');
    setGeneratedKey(null);
    setError(null);
  };

  const handleCloneUrlChange = (url: string) => {
    setCloneUrl(url);
    if (!name) {
      const match = url.match(/\/([^\/]+?)(\.git)?$/);
      if (match) setName(match[1]);
    }
  };

  const handleGenerateKey = async () => {
    if (!newKeyName.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const key = await generateKey(newKeyName.trim(), newKeyType);
      setSelectedKeyId(key.id);
      setGeneratedKey(key);
      setNewKeyName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate SSH key');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPublicKey = async (publicKey?: string) => {
    const keyToCopy = publicKey || generatedKey?.publicKey;
    if (!keyToCopy) return;
    try {
      // Check if clipboard API is available
      if (!navigator.clipboard) {
        throw new Error('Clipboard API not available. Please use HTTPS or localhost.');
      }
      await navigator.clipboard.writeText(keyToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const toggleTechStack = (stackId: string) => {
    setSelectedTechStacks(prev =>
      prev.includes(stackId) ? prev.filter(id => id !== stackId) : [...prev, stackId]
    );
  };

  const selectedKey = keys.find(k => k.id === selectedKeyId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-2xl max-h-[75vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Add Repository</h2>
            <button onClick={onClose} className="text-foreground-secondary hover:text-foreground">×</button>
          </div>
        </div>

        {/* Wizard Steps */}
        <WizardStepper
          steps={WIZARD_STEPS}
          activeStepId={activeStep}
          completedSteps={completedSteps}
          onStepClick={handleStepClick}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-error/20 border border-error/50 rounded text-error text-sm">{error}</div>
          )}

          {/* Step 1: Repository */}
          {activeStep === 'repository' && (
            <>
              <div>
                <label className="block text-sm text-foreground mb-1">Repository URL <span className="text-error">*</span></label>
                <input
                  type="text"
                  value={cloneUrl}
                  onChange={(e) => handleCloneUrlChange(e.target.value)}
                  placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
                  className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary"
                />
              </div>

              <div>
                <label className="block text-sm text-foreground mb-1">Clone Depth</label>
                <select
                  value={cloneDepth}
                  onChange={(e) => setCloneDepth(e.target.value as CloneDepthOption)}
                  className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground"
                >
                  <option value="shallow">Shallow clone (depth=1) - Fastest startup</option>
                  <option value="recent">Recent history (depth=10) - For recent blame/log</option>
                  <option value="full">Full clone - Complete git history</option>
                </select>
                <p className="text-xs text-foreground-tertiary mt-1">Shallow clones are faster but have limited git history.</p>
              </div>

              {isSSHUrl && (
                <div>
                  <label className="block text-sm text-foreground mb-1">SSH Key</label>
                  {generatedKey ? (
                    <div className="space-y-3">
                      <div className="p-3 bg-success/20 border border-success/50 rounded text-success text-sm">
                        Key "{generatedKey.name}" generated successfully!
                      </div>
                      <div className="p-3 bg-background-tertiary/50 rounded space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-foreground-secondary">Public Key (copy this to GitHub)</span>
                          <button type="button" onClick={() => handleCopyPublicKey()} className="text-xs text-primary hover:text-primary-hover">
                            {copied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <div className="font-mono text-xs text-foreground break-all bg-background/50 p-2 rounded max-h-20 overflow-y-auto">
                          {generatedKey.publicKey}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setGeneratedKey(null); setShowGenerateKey(false); }}
                          className="w-full mt-2 px-3 py-1.5 bg-background-input hover:bg-background-tertiary rounded text-sm text-foreground"
                        >Done</button>
                      </div>
                    </div>
                  ) : keys.length > 0 ? (
                    <>
                      <select
                        value={selectedKeyId}
                        onChange={(e) => setSelectedKeyId(e.target.value)}
                        className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground"
                      >
                        <option value="">Select SSH key...</option>
                        {keys.map((key) => (
                          <option key={key.id} value={key.id}>{key.name} ({key.keyType}){key.isDefault ? ' - default' : ''}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-3 mt-2">
                        {selectedKey && (
                          <button type="button" onClick={() => handleCopyPublicKey(selectedKey.publicKey)} className="text-sm text-primary hover:text-primary-hover">
                            {copied ? 'Copied!' : 'Copy public key'}
                          </button>
                        )}
                        {!showGenerateKey && (
                          <button type="button" onClick={() => setShowGenerateKey(true)} className="text-sm text-primary hover:text-primary-hover">
                            + Generate new key
                          </button>
                        )}
                      </div>
                      {showGenerateKey && (
                        <div className="mt-3 p-3 bg-background-tertiary/50 rounded space-y-3">
                          <div>
                            <label className="block text-xs text-foreground-secondary mb-1">Key Name</label>
                            <input type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="github-key"
                              className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground" />
                          </div>
                          <div className="flex items-center gap-3">
                            <select value={newKeyType} onChange={(e) => setNewKeyType(e.target.value as 'ed25519' | 'rsa' | 'ecdsa')}
                              className="px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground">
                              <option value="ed25519">Ed25519 (recommended)</option>
                              <option value="rsa">RSA 4096</option>
                              <option value="ecdsa">ECDSA</option>
                            </select>
                            <button type="button" onClick={handleGenerateKey} disabled={isGenerating || !newKeyName.trim()}
                              className="px-3 py-1.5 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 rounded text-sm text-foreground">
                              {isGenerating ? 'Generating...' : 'Generate'}
                            </button>
                            <button type="button" onClick={() => { setShowGenerateKey(false); setNewKeyName(''); }}
                              className="text-sm text-foreground-secondary hover:text-foreground">Cancel</button>
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
                          <input type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="github-key"
                            className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground" />
                        </div>
                        <div className="flex items-center gap-3">
                          <select value={newKeyType} onChange={(e) => setNewKeyType(e.target.value as 'ed25519' | 'rsa' | 'ecdsa')}
                            className="px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground">
                            <option value="ed25519">Ed25519 (recommended)</option>
                            <option value="rsa">RSA 4096</option>
                            <option value="ecdsa">ECDSA</option>
                          </select>
                          <button type="button" onClick={handleGenerateKey} disabled={isGenerating || !newKeyName.trim()}
                            className="px-3 py-1.5 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 rounded text-sm text-foreground">
                            {isGenerating ? 'Generating...' : 'Generate'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm text-foreground mb-1">Name <span className="text-error">*</span></label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-project" required
                  className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary" />
              </div>

              <div>
                <label className="block text-sm text-foreground mb-1">Description</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description"
                  className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary" />
              </div>
            </>
          )}

          {/* Step 2: Container */}
          {activeStep === 'container' && (
            <>
              {templates.length > 0 && (
                <div>
                  <label className="block text-sm text-foreground mb-1">Template</label>
                  <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground">
                    <option value="">Use default template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id} disabled={template.status !== 'ready'}>
                        {template.name}{template.status !== 'ready' && ` (${template.status})`}{template.isDefault && ' - Default'}
                      </option>
                    ))}
                  </select>
                  {selectedTemplateId && (() => {
                    const selected = templates.find(t => t.id === selectedTemplateId);
                    return selected?.techStacks && selected.techStacks.length > 0 && (
                      <p className="text-xs text-foreground-tertiary mt-1">Includes: {selected.techStacks.join(', ')}</p>
                    );
                  })()}
                </div>
              )}

              {availableTechStacks.length > 0 && (
                <div>
                  <label className="block text-sm text-foreground mb-2">Tech Stack</label>
                  <p className="text-xs text-foreground-tertiary mb-2">Select development tools to install on workspaces.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {availableTechStacks.map((stack) => {
                      const isInTemplate = templateTechStacks.includes(stack.id);
                      const isSelected = selectedTechStacks.includes(stack.id);
                      return (
                        <label key={stack.id} className={`flex items-start gap-2 p-2 rounded cursor-pointer transition-colors ${
                          isInTemplate ? 'bg-success/10 border border-success/30 cursor-default' :
                          isSelected ? 'bg-primary/20 border border-primary/50' :
                          'bg-background-tertiary/50 border border-border-secondary/50 hover:bg-background-tertiary'
                        }`}>
                          <input type="checkbox" checked={isSelected || isInTemplate} onChange={() => !isInTemplate && toggleTechStack(stack.id)} disabled={isInTemplate}
                            className="mt-0.5 rounded border-border bg-background-tertiary text-primary focus:ring-primary disabled:opacity-50" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-foreground flex items-center gap-1">
                              {stack.name}{isInTemplate && <span className="text-xs text-success">(in template)</span>}
                            </div>
                            <div className="text-xs text-foreground-secondary truncate">{stack.description}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm text-foreground mb-2">Resource Overrides</label>
                <p className="text-xs text-foreground-tertiary mb-3">Leave empty to use global defaults.</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-foreground-secondary mb-1">Memory (MB)</label>
                    <input type="number" value={resourceMemory} onChange={(e) => setResourceMemory(e.target.value)}
                      placeholder={`${proxmoxSettings?.resources?.defaultMemory ?? 2048}`} min={512} max={65536}
                      className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-secondary mb-1">CPU Cores</label>
                    <input type="number" value={resourceCpuCores} onChange={(e) => setResourceCpuCores(e.target.value)}
                      placeholder={`${proxmoxSettings?.resources?.defaultCpuCores ?? 2}`} min={1} max={32}
                      className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-secondary mb-1">Disk Size (GB)</label>
                    <input type="number" value={resourceDiskSize} onChange={(e) => setResourceDiskSize(e.target.value)}
                      placeholder={`${proxmoxSettings?.resources?.defaultDiskSize ?? 50}`} min={4} max={500}
                      className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary text-sm" />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Git Identity */}
          {activeStep === 'git-identity' && (
            <>
              <div>
                <label className="block text-sm text-foreground mb-2">Git Identity</label>
                <p className="text-xs text-foreground-tertiary mb-3">
                  Configure the git identity used for commits in this repository.
                </p>
                <GitIdentitySelector
                  value={gitIdentity}
                  onChange={setGitIdentity}
                  identities={gitIdentities}
                  onIdentityCreated={() => fetchGitIdentities()}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer - Wizard Navigation */}
        <WizardNavigation
          onBack={handleBack}
          onNext={handleNext}
          onCancel={onClose}
          onFinish={handleSubmit}
          isFirstStep={activeStep === 'repository'}
          isLastStep={activeStep === 'git-identity'}
          canProceed={canProceed()}
          isLoading={isLoading}
          finishLabel="Add Repository"
        />
      </div>
    </div>
  );
}

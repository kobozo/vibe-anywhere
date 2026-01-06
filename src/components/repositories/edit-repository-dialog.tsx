'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Repository, ProxmoxTemplate } from '@/lib/db/schema';
import { EnvVarEditor, type EnvVar } from '@/components/env-vars/env-var-editor';
import { useProxmoxSettings } from '@/hooks/useProxmoxSettings';

type RepoDialogTab = 'general' | 'environment' | 'resources';

interface EditRepositoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  repository: Repository | null;
  templates: ProxmoxTemplate[];
  onSave: (updates: {
    name?: string;
    description?: string;
    templateId?: string | null;
    envVars?: EnvVar[];
    resourceMemory?: number | null;
    resourceCpuCores?: number | null;
    resourceDiskSize?: number | null;
  }) => Promise<void>;
  isLoading: boolean;
}

export function EditRepositoryDialog({
  isOpen,
  onClose,
  repository,
  templates,
  onSave,
  isLoading,
}: EditRepositoryDialogProps) {
  const { settings: proxmoxSettings, fetchSettings: fetchProxmoxSettings } = useProxmoxSettings();
  const [activeTab, setActiveTab] = useState<RepoDialogTab>('general');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resource override state (empty string = use default)
  const [resourceMemory, setResourceMemory] = useState<string>('');
  const [resourceCpuCores, setResourceCpuCores] = useState<string>('');
  const [resourceDiskSize, setResourceDiskSize] = useState<string>('');
  const [resourcesModified, setResourcesModified] = useState(false);

  // Environment variables state
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [inheritedEnvVars, setInheritedEnvVars] = useState<Record<string, string>>({});
  const [envVarsLoading, setEnvVarsLoading] = useState(false);
  const [envVarsModified, setEnvVarsModified] = useState(false);

  // Load environment variables
  const loadEnvVars = useCallback(async (repoId: string) => {
    setEnvVarsLoading(true);
    try {
      const response = await fetch(`/api/repositories/${repoId}/env-vars`);
      if (response.ok) {
        const data = await response.json();
        setEnvVars(data.envVars || []);
        setInheritedEnvVars(data.inheritedEnvVars || {});
      }
    } catch (err) {
      console.error('Failed to load env vars:', err);
    } finally {
      setEnvVarsLoading(false);
    }
  }, []);

  // Reset form when dialog opens/closes or repository changes
  useEffect(() => {
    if (isOpen && repository) {
      setActiveTab('general');
      setName(repository.name);
      setDescription(repository.description || '');
      setTemplateId(repository.templateId || null);
      setError(null);
      // Initialize resource fields from repository (empty if null = use defaults)
      setResourceMemory(repository.resourceMemory?.toString() || '');
      setResourceCpuCores(repository.resourceCpuCores?.toString() || '');
      setResourceDiskSize(repository.resourceDiskSize?.toString() || '');
      setResourcesModified(false);
      setEnvVars([]);
      setInheritedEnvVars({});
      setEnvVarsModified(false);
      loadEnvVars(repository.id);
      fetchProxmoxSettings();
    }
  }, [isOpen, repository, loadEnvVars, fetchProxmoxSettings]);

  // Track env vars modifications
  const handleEnvVarsChange = useCallback((newEnvVars: EnvVar[]) => {
    setEnvVars(newEnvVars);
    setEnvVarsModified(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      // Parse resource values (empty string = null = use default)
      const memoryValue = resourceMemory ? parseInt(resourceMemory, 10) : null;
      const cpuValue = resourceCpuCores ? parseInt(resourceCpuCores, 10) : null;
      const diskValue = resourceDiskSize ? parseInt(resourceDiskSize, 10) : null;

      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        templateId,
        // Only include envVars if they were modified
        ...(envVarsModified ? { envVars } : {}),
        // Only include resources if they were modified
        ...(resourcesModified ? {
          resourceMemory: memoryValue,
          resourceCpuCores: cpuValue,
          resourceDiskSize: diskValue,
        } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save repository');
    }
  };

  if (!isOpen || !repository) return null;

  // Get the currently selected template's details
  const selectedTemplate = templates.find((t) => t.id === templateId);
  const readyTemplates = templates.filter((t) => t.status === 'ready');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Edit Repository</h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'general'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-secondary hover:text-foreground'}`}
          >
            General
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('resources')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'resources'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-secondary hover:text-foreground'}`}
          >
            Resources
            {(repository?.resourceMemory || repository?.resourceCpuCores || repository?.resourceDiskSize) && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded">
                Custom
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('environment')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'environment'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-secondary hover:text-foreground'}`}
          >
            Environment
            {envVars.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-background-tertiary rounded">
                {envVars.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-4">
            {/* General Tab */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm text-foreground mb-1">Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground focus:outline-none focus:border-primary"
                    placeholder="Repository name"
                    disabled={isLoading}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm text-foreground mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground focus:outline-none focus:border-primary h-20 resize-none"
                    placeholder="Optional description"
                    disabled={isLoading}
                  />
                </div>

                {/* Template Selection */}
                <div>
                  <label className="block text-sm text-foreground mb-1">Template</label>
                  <select
                    value={templateId || ''}
                    onChange={(e) => setTemplateId(e.target.value || null)}
                    className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground focus:outline-none focus:border-primary"
                    disabled={isLoading}
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

                  {/* Template Info */}
                  {selectedTemplate && (
                    <div className="mt-2 p-2 bg-background-tertiary/50 rounded text-sm">
                      <div className="text-foreground-secondary">
                        VMID: <span className="text-foreground">{selectedTemplate.vmid || 'Not provisioned'}</span>
                      </div>
                      {selectedTemplate.techStacks && selectedTemplate.techStacks.length > 0 && (
                        <div className="text-foreground-secondary">
                          Tech stacks: <span className="text-foreground">{selectedTemplate.techStacks.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Note about template change */}
                  <p className="text-xs text-foreground-tertiary mt-2">
                    Changing the template only affects new workspaces. Existing workspaces will continue using their original container.
                  </p>
                </div>

                {/* Repository Info */}
                <div className="bg-background-tertiary/50 rounded p-3 text-sm">
                  <div className="text-foreground-secondary">
                    Clone URL: <span className="text-foreground font-mono text-xs">{repository.cloneUrl}</span>
                  </div>
                  {repository.cloneDepth && (
                    <div className="text-foreground-secondary">
                      Clone Depth: <span className="text-foreground">{repository.cloneDepth}</span>
                    </div>
                  )}
                  <div className="text-foreground-secondary">
                    Default Branch: <span className="text-foreground">{repository.defaultBranch || 'main'}</span>
                  </div>
                </div>

                {/* No templates warning */}
                {readyTemplates.length === 0 && (
                  <div className="text-warning text-sm">
                    No ready templates available. Create and provision a template first.
                  </div>
                )}
              </div>
            )}

            {/* Resources Tab */}
            {activeTab === 'resources' && (
              <div className="space-y-4">
                <p className="text-sm text-foreground-secondary">
                  Override default resource allocations for workspaces created from this repository.
                  Leave fields empty to use global defaults.
                </p>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-foreground mb-1">Memory (MB)</label>
                    <input
                      type="number"
                      value={resourceMemory}
                      onChange={(e) => {
                        setResourceMemory(e.target.value);
                        setResourcesModified(true);
                      }}
                      placeholder={`${proxmoxSettings?.resources?.defaultMemory ?? 2048}`}
                      min={512}
                      max={65536}
                      className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary focus:outline-none focus:border-primary"
                      disabled={isLoading}
                    />
                    <p className="text-xs text-foreground-tertiary mt-1">
                      Min: 512 MB
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-foreground mb-1">CPU Cores</label>
                    <input
                      type="number"
                      value={resourceCpuCores}
                      onChange={(e) => {
                        setResourceCpuCores(e.target.value);
                        setResourcesModified(true);
                      }}
                      placeholder={`${proxmoxSettings?.resources?.defaultCpuCores ?? 2}`}
                      min={1}
                      max={32}
                      className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary focus:outline-none focus:border-primary"
                      disabled={isLoading}
                    />
                    <p className="text-xs text-foreground-tertiary mt-1">
                      Min: 1, Max: 32
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-foreground mb-1">Disk Size (GB)</label>
                    <input
                      type="number"
                      value={resourceDiskSize}
                      onChange={(e) => {
                        setResourceDiskSize(e.target.value);
                        setResourcesModified(true);
                      }}
                      placeholder={`${proxmoxSettings?.resources?.defaultDiskSize ?? 50}`}
                      min={4}
                      max={500}
                      className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary focus:outline-none focus:border-primary"
                      disabled={isLoading}
                    />
                    <p className="text-xs text-foreground-tertiary mt-1">
                      Min: 4 GB, Max: 500 GB
                    </p>
                  </div>
                </div>

                {/* Current values summary */}
                <div className="bg-background-tertiary/50 rounded p-3 text-sm">
                  <div className="text-foreground-secondary mb-1">Current configuration:</div>
                  <div className="grid grid-cols-3 gap-2 text-foreground">
                    <div>
                      Memory: {resourceMemory ? `${resourceMemory} MB` : <span className="text-foreground-tertiary">Default ({proxmoxSettings?.resources?.defaultMemory ?? 2048} MB)</span>}
                    </div>
                    <div>
                      CPU: {resourceCpuCores ? `${resourceCpuCores} cores` : <span className="text-foreground-tertiary">Default ({proxmoxSettings?.resources?.defaultCpuCores ?? 2} cores)</span>}
                    </div>
                    <div>
                      Disk: {resourceDiskSize ? `${resourceDiskSize} GB` : <span className="text-foreground-tertiary">Default ({proxmoxSettings?.resources?.defaultDiskSize ?? 50} GB)</span>}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-foreground-tertiary">
                  Resource changes only apply to newly created workspaces. Existing workspaces will keep their current resources.
                </p>
              </div>
            )}

            {/* Environment Tab */}
            {activeTab === 'environment' && (
              <div className="space-y-4">
                <p className="text-sm text-foreground-secondary">
                  Configure environment variables for containers created from this repository.
                  Variables are injected when workspaces start.
                </p>

                {envVarsLoading ? (
                  <div className="text-foreground-tertiary text-sm py-4 text-center">
                    Loading environment variables...
                  </div>
                ) : (
                  <EnvVarEditor
                    envVars={envVars}
                    onChange={handleEnvVarsChange}
                    disabled={isLoading}
                    inheritedVars={inheritedEnvVars}
                  />
                )}
              </div>
            )}

            {/* Error */}
            {error && <div className="text-error text-sm mt-4">{error}</div>}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-foreground hover:text-foreground-secondary transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

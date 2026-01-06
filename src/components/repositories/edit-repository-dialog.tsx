'use client';

import { useState, useEffect } from 'react';
import type { Repository, ProxmoxTemplate } from '@/lib/db/schema';

interface EditRepositoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  repository: Repository | null;
  templates: ProxmoxTemplate[];
  onSave: (updates: {
    name?: string;
    description?: string;
    templateId?: string | null;
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes or repository changes
  useEffect(() => {
    if (isOpen && repository) {
      setName(repository.name);
      setDescription(repository.description || '');
      setTemplateId(repository.templateId || null);
      setError(null);
    }
  }, [isOpen, repository]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        templateId,
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
      <div className="bg-background-secondary rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Edit Repository</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
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

            {/* Error */}
            {error && <div className="text-error text-sm">{error}</div>}

            {/* No templates warning */}
            {readyTemplates.length === 0 && (
              <div className="text-warning text-sm">
                No ready templates available. Create and provision a template first.
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-foreground hover:text-foreground transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-foreground rounded transition-colors disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

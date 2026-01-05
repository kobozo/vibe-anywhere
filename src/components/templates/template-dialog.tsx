'use client';

import { useState, useEffect } from 'react';
import type { ProxmoxTemplate } from '@/lib/db/schema';

// Available tech stacks
const TECH_STACKS = [
  { id: 'nodejs', name: 'Node.js 22', description: 'JavaScript/TypeScript runtime' },
  { id: 'python', name: 'Python 3.12', description: 'Python with pip' },
  { id: 'go', name: 'Go 1.22', description: 'Go programming language' },
  { id: 'rust', name: 'Rust', description: 'Rust with cargo' },
  { id: 'docker', name: 'Docker', description: 'Container runtime' },
];

interface TemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  template?: ProxmoxTemplate | null; // If provided, edit mode
  onSave: (data: {
    name: string;
    description?: string;
    techStacks?: string[];
    isDefault?: boolean;
  }) => Promise<void>;
  isLoading: boolean;
}

export function TemplateDialog({
  isOpen,
  onClose,
  template,
  onSave,
  isLoading,
}: TemplateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [techStacks, setTechStacks] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!template;
  const isProvisioned = template?.status === 'ready' || template?.status === 'provisioning';

  // Reset form when dialog opens/closes or template changes
  useEffect(() => {
    if (isOpen) {
      if (template) {
        setName(template.name);
        setDescription(template.description || '');
        setTechStacks(template.techStacks || []);
        setIsDefault(template.isDefault);
      } else {
        setName('');
        setDescription('');
        setTechStacks(['nodejs']); // Default to Node.js
        setIsDefault(false);
      }
      setError(null);
    }
  }, [isOpen, template]);

  const handleTechStackToggle = (stackId: string) => {
    if (isProvisioned) return; // Can't change tech stacks after provisioning
    setTechStacks((prev) =>
      prev.includes(stackId)
        ? prev.filter((id) => id !== stackId)
        : [...prev, stackId]
    );
  };

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
        techStacks: isProvisioned ? undefined : techStacks, // Don't send tech stacks if editing provisioned template
        isDefault,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            {isEditMode ? 'Edit Template' : 'Create Template'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                placeholder="e.g., Node.js Development"
                disabled={isLoading}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500 h-20 resize-none"
                placeholder="Optional description"
                disabled={isLoading}
              />
            </div>

            {/* Tech Stacks */}
            <div>
              <label className="block text-sm text-gray-300 mb-2">
                Tech Stacks
                {isProvisioned && (
                  <span className="text-gray-500 ml-2">(locked after provisioning)</span>
                )}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TECH_STACKS.map((stack) => (
                  <label
                    key={stack.id}
                    className={`flex items-start gap-2 p-2 rounded border ${
                      isProvisioned
                        ? 'border-gray-700 opacity-50 cursor-not-allowed'
                        : 'border-gray-600 cursor-pointer hover:border-gray-500'
                    } ${techStacks.includes(stack.id) ? 'bg-blue-600/20 border-blue-500' : 'bg-gray-700'}`}
                  >
                    <input
                      type="checkbox"
                      checked={techStacks.includes(stack.id)}
                      onChange={() => handleTechStackToggle(stack.id)}
                      disabled={isLoading || isProvisioned}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm text-white">{stack.name}</div>
                      <div className="text-xs text-gray-400">{stack.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Default Toggle */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  disabled={isLoading}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-300">Set as default template</span>
              </label>
              <p className="text-xs text-gray-500 mt-1">
                New repositories will use the default template unless specified otherwise.
              </p>
            </div>

            {/* Template Status Info */}
            {isEditMode && template && (
              <div className="bg-gray-700/50 rounded p-3 text-sm">
                <div className="text-gray-400">Status: <span className="text-white capitalize">{template.status}</span></div>
                {template.vmid && (
                  <div className="text-gray-400">VMID: <span className="text-white">{template.vmid}</span></div>
                )}
                {template.node && (
                  <div className="text-gray-400">Node: <span className="text-white">{template.node}</span></div>
                )}
                {template.errorMessage && (
                  <div className="text-red-400 mt-2">Error: {template.errorMessage}</div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-red-400 text-sm">{error}</div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

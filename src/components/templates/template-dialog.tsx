'use client';

import { useState, useEffect, useMemo } from 'react';
import type { ProxmoxTemplate } from '@/lib/db/schema';
import {
  TECH_STACKS,
  getStacksByCategory,
  getTechStack,
  getSelectedDependentNames,
  type TechStackCategory,
} from '@/lib/container/proxmox/tech-stacks';

interface TemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  template?: ProxmoxTemplate | null; // If provided, edit mode
  parentTemplate?: ProxmoxTemplate | null; // If provided, clone mode (create based on this template)
  templates?: ProxmoxTemplate[]; // All templates (for "Based on" dropdown)
  onSave: (data: {
    name: string;
    description?: string;
    techStacks?: string[];
    isDefault?: boolean;
    staging?: boolean;
    parentTemplateId?: string;
  }) => Promise<void>;
  isLoading: boolean;
}

export function TemplateDialog({
  isOpen,
  onClose,
  template,
  parentTemplate,
  templates = [],
  onSave,
  isLoading,
}: TemplateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [techStacks, setTechStacks] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [enableStaging, setEnableStaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TechStackCategory>('runtime');
  const [hoveredLock, setHoveredLock] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string>(''); // User-selected parent from dropdown

  const isEditMode = !!template;
  const isCloneMode = !!parentTemplate && !template; // Clone mode = parent provided (from Clone button)
  const isProvisioned = template?.status === 'ready' || template?.status === 'provisioning' || template?.status === 'staging';

  // Get available templates for "Based on" dropdown (only ready templates, excluding current if editing)
  const availableParentTemplates = useMemo(() => {
    return templates.filter(t =>
      t.status === 'ready' &&
      t.id !== template?.id // Don't allow selecting self as parent
    );
  }, [templates, template?.id]);

  // Effective parent: either forced (from Clone button) or user-selected from dropdown
  const effectiveParent = useMemo(() => {
    if (parentTemplate) return parentTemplate; // Forced clone mode
    if (selectedParentId) {
      return templates.find(t => t.id === selectedParentId) || null;
    }
    return null;
  }, [parentTemplate, selectedParentId, templates]);

  // Get inherited stacks from effective parent
  const inheritedStacks = useMemo(() => {
    if (!effectiveParent) return [];
    return [
      ...(effectiveParent.inheritedTechStacks || []),
      ...(effectiveParent.techStacks || []),
    ];
  }, [effectiveParent]);

  // Get stacks by category
  const runtimeStacks = useMemo(() => getStacksByCategory('runtime'), []);
  const aiStacks = useMemo(() => getStacksByCategory('ai-assistant'), []);

  // Check if a stack is locked (has dependents that are selected)
  const getLockedDependents = (stackId: string): string[] => {
    return getSelectedDependentNames(stackId, techStacks);
  };

  const isStackLocked = (stackId: string): boolean => {
    return getLockedDependents(stackId).length > 0;
  };

  // Reset form when dialog opens/closes or template changes
  useEffect(() => {
    if (isOpen) {
      if (template) {
        // Edit mode
        setName(template.name);
        setDescription(template.description || '');
        setTechStacks(template.techStacks || []);
        setIsDefault(template.isDefault);
        setEnableStaging(false); // Don't enable staging for existing templates
        setSelectedParentId(''); // Clear parent selection
      } else if (parentTemplate) {
        // Clone mode (from Clone button) - pre-fill based on parent
        setName(`${parentTemplate.name} (Clone)`);
        setDescription(parentTemplate.description || '');
        setTechStacks([]); // Start with no additional stacks (inherited shown separately)
        setIsDefault(false);
        setEnableStaging(false);
        setSelectedParentId(''); // Parent is forced, not selected
      } else {
        // Create new mode
        setName('');
        setDescription('');
        setTechStacks(['nodejs']); // Default to Node.js
        setIsDefault(false);
        setEnableStaging(false);
        setSelectedParentId(''); // No parent selected by default
      }
      setError(null);
      setActiveTab('runtime');
    }
  }, [isOpen, template, parentTemplate]);

  const handleTechStackToggle = (stackId: string) => {
    if (isProvisioned) return; // Can't change tech stacks after provisioning
    if (inheritedStacks.includes(stackId)) return; // Can't toggle inherited stacks

    const stack = getTechStack(stackId);
    if (!stack) return;

    if (techStacks.includes(stackId)) {
      // REMOVING - check if anything depends on it
      if (isStackLocked(stackId)) {
        // Can't remove - it has dependents
        return;
      }
      setTechStacks((prev) => prev.filter((id) => id !== stackId));
    } else {
      // ADDING - auto-add dependencies (but exclude inherited ones)
      const deps = (stack.dependencies || []).filter(
        (dep) => !inheritedStacks.includes(dep)
      );
      setTechStacks((prev) => [...new Set([...prev, ...deps, stackId])]);
    }
  };

  // When parent selection changes, filter out tech stacks that are now inherited
  const handleParentChange = (newParentId: string) => {
    setSelectedParentId(newParentId);

    if (newParentId) {
      const parent = templates.find(t => t.id === newParentId);
      if (parent) {
        const parentStacks = [
          ...(parent.inheritedTechStacks || []),
          ...(parent.techStacks || []),
        ];
        // Remove any selected stacks that are now inherited
        setTechStacks(prev => prev.filter(s => !parentStacks.includes(s)));
      }
    }
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
        staging: !isEditMode ? enableStaging : undefined, // Only send staging for new templates
        parentTemplateId: effectiveParent?.id, // Include parent if selected or forced
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  if (!isOpen) return null;

  const currentStacks = activeTab === 'runtime' ? runtimeStacks : aiStacks;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            {isEditMode ? 'Edit Template' : isCloneMode ? 'Clone Template' : 'Create Template'}
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

            {/* Based on (Parent Template) - only for new templates, not in forced clone mode */}
            {!isEditMode && !isCloneMode && availableParentTemplates.length > 0 && (
              <div>
                <label className="block text-sm text-gray-300 mb-1">Based on (optional)</label>
                <select
                  value={selectedParentId}
                  onChange={(e) => handleParentChange(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                  disabled={isLoading}
                >
                  <option value="">None - start from scratch</option>
                  {availableParentTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.techStacks && t.techStacks.length > 0 ? `(${t.techStacks.join(', ')})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Clone from an existing template to inherit its configuration and tech stacks.
                </p>
              </div>
            )}

            {/* Parent template info (when selected or in clone mode) */}
            {effectiveParent && (
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded">
                <div className="text-sm text-purple-300">
                  {isCloneMode ? 'Based on:' : 'Inheriting from:'}{' '}
                  <span className="text-white font-medium">{effectiveParent.name}</span>
                </div>
                {inheritedStacks.length > 0 && (
                  <div className="text-xs text-purple-400 mt-1">
                    Inherits: {inheritedStacks.map(id => getTechStack(id)?.name).filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Tech Stacks with Tabs */}
            <div>
              <label className="block text-sm text-gray-300 mb-2">
                Tech Stacks
                {isProvisioned && (
                  <span className="text-gray-500 ml-2">(locked after provisioning)</span>
                )}
              </label>

              {/* Tabs */}
              <div className="flex border-b border-gray-600 mb-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('runtime')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'runtime'
                      ? 'text-blue-400 border-b-2 border-blue-400'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  Dev Tools
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ai-assistant')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'ai-assistant'
                      ? 'text-blue-400 border-b-2 border-blue-400'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  AI Assistants
                </button>
              </div>

              {/* Stack Grid */}
              <div className="grid grid-cols-2 gap-2">
                {currentStacks.map((stack) => {
                  const isSelected = techStacks.includes(stack.id);
                  const isInherited = inheritedStacks.includes(stack.id);
                  const locked = isStackLocked(stack.id);
                  const lockedByNames = locked ? getLockedDependents(stack.id) : [];
                  const isDisabled = isLoading || isProvisioned || (isSelected && locked) || isInherited;

                  return (
                    <label
                      key={stack.id}
                      className={`relative flex items-start gap-2 p-2 rounded border ${
                        isProvisioned
                          ? 'border-gray-700 opacity-50 cursor-not-allowed'
                          : isInherited
                          ? 'bg-purple-600/20 border-purple-500 cursor-not-allowed'
                          : isDisabled
                          ? 'border-gray-600 cursor-not-allowed'
                          : 'border-gray-600 cursor-pointer hover:border-gray-500'
                      } ${!isInherited && isSelected ? 'bg-blue-600/20 border-blue-500' : !isInherited && !isProvisioned ? 'bg-gray-700' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected || isInherited}
                        onChange={() => handleTechStackToggle(stack.id)}
                        disabled={isDisabled}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-white truncate">{stack.name}</span>
                          {/* Inherited badge */}
                          {isInherited && (
                            <span className="text-xs text-purple-400 ml-1">(inherited)</span>
                          )}
                          {/* Lock icon for dependencies */}
                          {isSelected && locked && !isInherited && (
                            <span
                              className="relative cursor-help"
                              onMouseEnter={() => setHoveredLock(stack.id)}
                              onMouseLeave={() => setHoveredLock(null)}
                            >
                              <svg
                                className="w-3.5 h-3.5 text-yellow-500"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              {/* Tooltip */}
                              {hoveredLock === stack.id && (
                                <div className="absolute bottom-full left-0 mb-2 px-2 py-1 bg-gray-900 text-xs text-gray-200 rounded shadow-lg whitespace-nowrap z-10">
                                  Required by: {lockedByNames.join(', ')}
                                </div>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 truncate">{stack.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Selection summary */}
              {(techStacks.length > 0 || inheritedStacks.length > 0) && (
                <div className="mt-2 text-xs text-gray-400 space-y-1">
                  {inheritedStacks.length > 0 && (
                    <div>
                      <span className="text-purple-400">Inherited:</span>{' '}
                      {inheritedStacks.map(id => getTechStack(id)?.name).filter(Boolean).join(', ')}
                    </div>
                  )}
                  {techStacks.length > 0 && (
                    <div>
                      <span className="text-blue-400">{isCloneMode ? 'Additional:' : 'Selected:'}</span>{' '}
                      {techStacks.map(id => getTechStack(id)?.name).filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              )}
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

            {/* Staging Mode Toggle - only for new templates */}
            {!isEditMode && (
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableStaging}
                    onChange={(e) => setEnableStaging(e.target.checked)}
                    disabled={isLoading}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-300">Enable staging mode</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Keep container running after provisioning for manual customization.
                  You can SSH into the container to install additional software before finalizing.
                </p>
              </div>
            )}

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

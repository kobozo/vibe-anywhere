'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ProxmoxTemplate } from '@/lib/db/schema';
import { useAuth } from '@/hooks/useAuth';
import { WizardStepper, WizardNavigation } from '@/components/ui/wizard-stepper';
import {
  TECH_STACKS,
  getStacksByCategory,
  getTechStack,
  getSelectedDependentNames,
  type TechStackCategory,
} from '@/lib/container/proxmox/tech-stacks';

// CT Template type from API
interface CtTemplate {
  id: string;
  volid: string;   // Full volume ID for container creation
  name: string;
  os: string;
  version: string;
  storage: string;
  node: string;
}

// Selection can be a CT template or Vibe Anywhere template
type BaseSelection =
  | { type: 'ct'; id: string; volid: string; name: string }
  | { type: 'template'; id: string; template: ProxmoxTemplate }
  | null;

// Wizard step IDs
type WizardStepId = 'basic-info' | 'base-selection' | 'tech-stacks' | 'options';

const WIZARD_STEPS = [
  { id: 'basic-info' as const, label: 'Basic Info' },
  { id: 'base-selection' as const, label: 'Base Selection' },
  { id: 'tech-stacks' as const, label: 'Tech Stacks' },
  { id: 'options' as const, label: 'Options' },
];

interface TemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  template?: ProxmoxTemplate | null; // If provided, edit mode
  parentTemplate?: ProxmoxTemplate | null; // If provided, clone mode (create based on this template)
  templates?: ProxmoxTemplate[]; // All templates (for "Based on" dropdown)
  defaultCtTemplate?: string; // Default CT template from settings
  onSave: (data: {
    name: string;
    description?: string;
    techStacks?: string[];
    isDefault?: boolean;
    staging?: boolean;
    parentTemplateId?: string;
    baseCtTemplate?: string;
  }) => Promise<void>;
  isLoading: boolean;
}

export function TemplateDialog({
  isOpen,
  onClose,
  template,
  parentTemplate,
  templates = [],
  defaultCtTemplate,
  onSave,
  isLoading,
}: TemplateDialogProps) {
  const { token } = useAuth();

  // Wizard state
  const [activeStep, setActiveStep] = useState<WizardStepId>('basic-info');
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStepId>>(new Set());

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [techStacks, setTechStacks] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [enableStaging, setEnableStaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TechStackCategory>('runtime');
  const [hoveredLock, setHoveredLock] = useState<string | null>(null);

  // CT Templates state
  const [ctTemplates, setCtTemplates] = useState<CtTemplate[]>([]);
  const [ctTemplatesLoading, setCtTemplatesLoading] = useState(false);
  const [ctTemplatesError, setCtTemplatesError] = useState<string | null>(null);

  // Selected base (either CT template or Vibe Anywhere template)
  const [selectedBaseValue, setSelectedBaseValue] = useState<string>('');

  const isEditMode = !!template;
  const isCloneMode = !!parentTemplate && !template; // Clone mode = parent provided (from Clone button)
  const isProvisioned = template?.status === 'ready' || template?.status === 'provisioning' || template?.status === 'staging';

  // Fetch CT templates when dialog opens
  useEffect(() => {
    if (isOpen && !isEditMode && !isCloneMode && token) {
      setCtTemplatesLoading(true);
      setCtTemplatesError(null);
      fetch('/api/proxmox/ct-templates', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            setCtTemplatesError(data.error);
          } else {
            setCtTemplates(data.data || []);
          }
        })
        .catch(err => {
          setCtTemplatesError(err.message || 'Failed to fetch CT templates');
        })
        .finally(() => {
          setCtTemplatesLoading(false);
        });
    }
  }, [isOpen, isEditMode, isCloneMode, token]);

  // Get available Vibe Anywhere templates for dropdown (only ready templates, excluding current if editing)
  const availableParentTemplates = useMemo(() => {
    return templates.filter(t =>
      t.status === 'ready' &&
      t.id !== template?.id // Don't allow selecting self as parent
    );
  }, [templates, template?.id]);

  // Parse selected base value into structured selection
  const selectedBase = useMemo((): BaseSelection => {
    if (!selectedBaseValue) return null;

    if (selectedBaseValue.startsWith('ct:')) {
      const ctVolid = selectedBaseValue.slice(3);
      const ct = ctTemplates.find(t => t.volid === ctVolid);
      return ct ? { type: 'ct', id: ct.id, volid: ct.volid, name: ct.name } : null;
    }

    if (selectedBaseValue.startsWith('tpl:')) {
      const tplId = selectedBaseValue.slice(4);
      const tpl = templates.find(t => t.id === tplId);
      return tpl ? { type: 'template', id: tplId, template: tpl } : null;
    }

    return null;
  }, [selectedBaseValue, ctTemplates, templates]);

  // Effective parent: either forced (from Clone button) or user-selected Vibe Anywhere template
  const effectiveParent = useMemo(() => {
    if (parentTemplate) return parentTemplate; // Forced clone mode
    if (selectedBase?.type === 'template') {
      return selectedBase.template;
    }
    return null;
  }, [parentTemplate, selectedBase]);

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
  const getLockedDependents = useCallback((stackId: string): string[] => {
    return getSelectedDependentNames(stackId, techStacks);
  }, [techStacks]);

  const isStackLocked = useCallback((stackId: string): boolean => {
    return getLockedDependents(stackId).length > 0;
  }, [getLockedDependents]);

  // Track if dialog was just opened (to avoid resetting form on every defaultCtTemplate change)
  const [dialogJustOpened, setDialogJustOpened] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setDialogJustOpened(true);
      setActiveStep('basic-info');
      setCompletedSteps(new Set());

      if (template) {
        // Edit mode
        setName(template.name);
        setDescription(template.description || '');
        setTechStacks(template.techStacks || []);
        setIsDefault(template.isDefault);
        setEnableStaging(false);
        setSelectedBaseValue('');
      } else if (parentTemplate) {
        // Clone mode (from Clone button) - pre-fill based on parent
        setName(`${parentTemplate.name} (Clone)`);
        setDescription(parentTemplate.description || '');
        setTechStacks([]);
        setIsDefault(false);
        setEnableStaging(false);
        setSelectedBaseValue('');
      } else {
        // Create new mode
        setName('');
        setDescription('');
        setTechStacks(['nodejs']);
        setIsDefault(false);
        setEnableStaging(false);
        setSelectedBaseValue(''); // Will be set by the next effect when CT templates/default loads
      }
      setError(null);
      setActiveTab('runtime');
    } else {
      setDialogJustOpened(false);
    }
  }, [isOpen, template, parentTemplate]);

  // Set default CT template selection when available (separate from form reset)
  useEffect(() => {
    // Only run in create mode when we need to set a default
    if (!isOpen || isEditMode || isCloneMode) return;
    // Only set if no selection yet (avoid overwriting user's choice)
    if (selectedBaseValue && !dialogJustOpened) return;

    // Try to use the default CT template from settings
    if (defaultCtTemplate) {
      // Find matching CT template by volid or id
      const defaultCt = ctTemplates.find(t => t.volid === defaultCtTemplate || t.id === defaultCtTemplate);
      if (defaultCt) {
        setSelectedBaseValue(`ct:${defaultCt.volid}`);
        setDialogJustOpened(false);
        return;
      }
    }

    // Fallback: use first available CT template if we have them loaded
    if (ctTemplates.length > 0) {
      const fallbackCt = ctTemplates.find(t => t.id === 'debian-12-standard') || ctTemplates[0];
      if (fallbackCt) {
        setSelectedBaseValue(`ct:${fallbackCt.volid}`);
        setDialogJustOpened(false);
      }
    }
  }, [isOpen, isEditMode, isCloneMode, ctTemplates, defaultCtTemplate, selectedBaseValue, dialogJustOpened]);

  const handleTechStackToggle = (stackId: string) => {
    if (isProvisioned) return;
    if (inheritedStacks.includes(stackId)) return;

    const stack = getTechStack(stackId);
    if (!stack) return;

    if (techStacks.includes(stackId)) {
      if (isStackLocked(stackId)) return;
      setTechStacks((prev) => prev.filter((id) => id !== stackId));
    } else {
      const deps = (stack.dependencies || []).filter(
        (dep) => !inheritedStacks.includes(dep)
      );
      setTechStacks((prev) => [...new Set([...prev, ...deps, stackId])]);
    }
  };

  // When base selection changes, filter out tech stacks that are now inherited
  const handleBaseChange = (newValue: string) => {
    setSelectedBaseValue(newValue);

    // If selecting a Vibe Anywhere template, filter out inherited stacks
    if (newValue.startsWith('tpl:')) {
      const tplId = newValue.slice(4);
      const parent = templates.find(t => t.id === tplId);
      if (parent) {
        const parentStacks = [
          ...(parent.inheritedTechStacks || []),
          ...(parent.techStacks || []),
        ];
        setTechStacks(prev => prev.filter(s => !parentStacks.includes(s)));
      }
    }
  };

  // Wizard step validation
  const isStep1Valid = (): boolean => !!name.trim();
  const isStep2Valid = (): boolean => {
    if (isEditMode || isCloneMode) return true;
    return !!selectedBase;
  };
  const isStep3Valid = (): boolean => true;
  const isStep4Valid = (): boolean => true;

  const canProceed = (): boolean => {
    switch (activeStep) {
      case 'basic-info': return isStep1Valid();
      case 'base-selection': return isStep2Valid();
      case 'tech-stacks': return isStep3Valid();
      case 'options': return isStep4Valid();
      default: return false;
    }
  };

  // Wizard navigation handlers
  const handleNext = () => {
    setError(null);
    if (activeStep === 'basic-info' && isStep1Valid()) {
      setCompletedSteps((prev) => new Set(prev).add('basic-info'));
      setActiveStep('base-selection');
    } else if (activeStep === 'base-selection' && isStep2Valid()) {
      setCompletedSteps((prev) => new Set(prev).add('base-selection'));
      setActiveStep('tech-stacks');
    } else if (activeStep === 'tech-stacks' && isStep3Valid()) {
      setCompletedSteps((prev) => new Set(prev).add('tech-stacks'));
      setActiveStep('options');
    }
  };

  const handleBack = () => {
    setError(null);
    if (activeStep === 'base-selection') setActiveStep('basic-info');
    else if (activeStep === 'tech-stacks') setActiveStep('base-selection');
    else if (activeStep === 'options') setActiveStep('tech-stacks');
  };

  const handleStepClick = (stepId: string) => {
    const step = stepId as WizardStepId;
    const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === step);
    const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === activeStep);
    if (completedSteps.has(step) || stepIndex < currentIndex) {
      setError(null);
      setActiveStep(step);
    }
  };

  const handleSubmit = async () => {
    setError(null);

    // Safety checks with step navigation
    if (!name.trim()) {
      setError('Name is required');
      setActiveStep('basic-info');
      return;
    }

    if (!isEditMode && !isCloneMode && !selectedBase) {
      setError('Please select a base');
      setActiveStep('base-selection');
      return;
    }

    try {
      const saveData: Parameters<typeof onSave>[0] = {
        name: name.trim(),
        description: description.trim() || undefined,
        techStacks: isProvisioned ? undefined : techStacks,
        isDefault,
        staging: !isEditMode ? enableStaging : undefined,
      };

      // Set either parentTemplateId or baseCtTemplate based on selection
      if (isCloneMode && parentTemplate) {
        saveData.parentTemplateId = parentTemplate.id;
      } else if (selectedBase?.type === 'template') {
        saveData.parentTemplateId = selectedBase.id;
      } else if (selectedBase?.type === 'ct') {
        // Use volid for container creation (e.g., "local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst")
        saveData.baseCtTemplate = selectedBase.volid;
      }

      await onSave(saveData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  if (!isOpen) return null;

  const currentStacks = activeTab === 'runtime' ? runtimeStacks : aiStacks;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-2xl mx-4 min-h-[85vh] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditMode ? 'Edit Template' : isCloneMode ? 'Clone Template' : 'Create Template'}
          </h2>
        </div>

        {/* Wizard Steps (Create/Clone) or Tabs (Edit) */}
        {isEditMode ? (
          // Edit mode: Use tabs for flexible navigation
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveStep('basic-info')}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeStep === 'basic-info'
                  ? 'text-primary border-b-2 border-primary -mb-[1px]'
                  : 'text-foreground-secondary hover:text-foreground'
              }`}
            >
              Basic Info
            </button>
            <button
              type="button"
              onClick={() => setActiveStep('base-selection')}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeStep === 'base-selection'
                  ? 'text-primary border-b-2 border-primary -mb-[1px]'
                  : 'text-foreground-secondary hover:text-foreground'
              }`}
            >
              Base Selection
            </button>
            <button
              type="button"
              onClick={() => setActiveStep('tech-stacks')}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeStep === 'tech-stacks'
                  ? 'text-primary border-b-2 border-primary -mb-[1px]'
                  : 'text-foreground-secondary hover:text-foreground'
              }`}
            >
              Tech Stacks
            </button>
            <button
              type="button"
              onClick={() => setActiveStep('options')}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeStep === 'options'
                  ? 'text-primary border-b-2 border-primary -mb-[1px]'
                  : 'text-foreground-secondary hover:text-foreground'
              }`}
            >
              Options
            </button>
          </div>
        ) : (
          // Create/Clone mode: Use wizard for sequential navigation
          <WizardStepper
            steps={WIZARD_STEPS}
            activeStepId={activeStep}
            completedSteps={completedSteps}
            onStepClick={handleStepClick}
          />
        )}

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-3 bg-error/20 border border-error/50 rounded text-error text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Basic Info */}
          {activeStep === 'basic-info' && (
            <>
              <div>
                <label className="block text-sm text-foreground mb-1">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground focus:outline-none focus:border-primary"
                  placeholder="e.g., Node.js Development"
                  disabled={isLoading}
                />
              </div>

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
            </>
          )}

          {/* Step 2: Base Selection */}
          {activeStep === 'base-selection' && (
            <>
              {isEditMode ? (
                // Edit mode: Show read-only base info
                <div className="p-3 bg-background-tertiary/50 rounded">
                  <div className="text-sm text-foreground-secondary mb-2">
                    Base cannot be changed after creation
                  </div>
                  {template.baseCtTemplate && (
                    <div className="text-sm">
                      Base CT: <span className="text-foreground font-medium">{template.baseCtTemplate}</span>
                    </div>
                  )}
                  {template.parentTemplateId && effectiveParent && (
                    <>
                      <div className="text-sm">
                        Based on: <span className="text-foreground font-medium">{effectiveParent.name}</span>
                      </div>
                      {inheritedStacks.length > 0 && (
                        <div className="text-xs text-purple-400 mt-1">
                          Inherits: {inheritedStacks.map(id => getTechStack(id)?.name).filter(Boolean).join(', ')}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : isCloneMode ? (
                // Clone mode: Show parent info (read-only)
                <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded">
                  <div className="text-sm text-purple-300">
                    Cloning from:{' '}
                    <span className="text-foreground font-medium">{parentTemplate.name}</span>
                  </div>
                  {inheritedStacks.length > 0 && (
                    <div className="text-xs text-purple-400 mt-1">
                      Inherits: {inheritedStacks.map(id => getTechStack(id)?.name).filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              ) : (
                // Create mode: Show dropdown and info cards
                <>
                  <div>
                    <label className="block text-sm text-foreground mb-1">Based on *</label>
                    {ctTemplatesLoading ? (
                      <div className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground-secondary">
                        Loading CT templates...
                      </div>
                    ) : ctTemplatesError ? (
                      <div className="w-full px-3 py-2 bg-background-tertiary border border-error rounded text-error text-sm">
                        {ctTemplatesError}
                      </div>
                    ) : (
                      <select
                        value={selectedBaseValue}
                        onChange={(e) => handleBaseChange(e.target.value)}
                        className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground focus:outline-none focus:border-primary"
                        disabled={isLoading}
                      >
                        <option value="">Select a base...</option>

                        {/* CT Templates Group */}
                        {ctTemplates.length > 0 && (
                          <optgroup label="CT Templates (OS Images)">
                            {ctTemplates.map((ct) => (
                              <option key={ct.volid} value={`ct:${ct.volid}`}>
                                {ct.name}
                              </option>
                            ))}
                          </optgroup>
                        )}

                        {/* Vibe Anywhere Templates Group */}
                        {availableParentTemplates.length > 0 && (
                          <optgroup label="Vibe Anywhere Templates">
                            {availableParentTemplates.map((t) => (
                              <option key={`tpl:${t.id}`} value={`tpl:${t.id}`}>
                                {t.name} {t.techStacks && t.techStacks.length > 0 ? `(${t.techStacks.join(', ')})` : ''}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    )}
                    <p className="text-xs text-foreground-tertiary mt-1">
                      {selectedBase?.type === 'ct'
                        ? 'Create from a fresh OS image with full provisioning.'
                        : selectedBase?.type === 'template'
                        ? 'Clone from an existing template to inherit its configuration and tech stacks.'
                        : 'Select a CT template (OS image) or an existing Vibe Anywhere template.'}
                    </p>
                  </div>

                  {/* Selected base info cards */}
                  {selectedBase?.type === 'template' && effectiveParent && (
                    <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded">
                      <div className="text-sm text-purple-300">
                        Inheriting from:{' '}
                        <span className="text-foreground font-medium">{effectiveParent.name}</span>
                      </div>
                      {inheritedStacks.length > 0 && (
                        <div className="text-xs text-purple-400 mt-1">
                          Inherits: {inheritedStacks.map(id => getTechStack(id)?.name).filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedBase?.type === 'ct' && (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded">
                      <div className="text-sm text-blue-300">
                        Base OS:{' '}
                        <span className="text-foreground font-medium">{selectedBase.name}</span>
                      </div>
                      <div className="text-xs text-blue-400 mt-1">
                        Full provisioning will be performed (Node.js, Git, Vibe Anywhere Agent, etc.)
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Step 3: Tech Stacks */}
          {activeStep === 'tech-stacks' && (
            <div>
              <label className="block text-sm text-foreground mb-2">
                Tech Stacks
                {isProvisioned && (
                  <span className="text-foreground-tertiary ml-2">(locked after provisioning)</span>
                )}
              </label>

              {/* Tabs */}
              <div className="flex border-b border-border-secondary mb-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('runtime')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'runtime'
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-foreground-secondary hover:text-foreground'
                  }`}
                >
                  Dev Tools
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ai-assistant')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'ai-assistant'
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-foreground-secondary hover:text-foreground'
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
                          ? 'border-border opacity-50 cursor-not-allowed'
                          : isInherited
                          ? 'bg-purple-600/20 border-purple-500 cursor-not-allowed'
                          : isDisabled
                          ? 'border-border-secondary cursor-not-allowed'
                          : 'border-border-secondary cursor-pointer hover:border-foreground-tertiary'
                      } ${!isInherited && isSelected ? 'bg-primary/20 border-primary' : !isInherited && !isProvisioned ? 'bg-background-tertiary' : ''}`}
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
                          <span className="text-sm text-foreground truncate">{stack.name}</span>
                          {isInherited && (
                            <span className="text-xs text-purple-400 ml-1">(inherited)</span>
                          )}
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
                              {hoveredLock === stack.id && (
                                <div className="absolute bottom-full left-0 mb-2 px-2 py-1 bg-background text-xs text-foreground rounded shadow-lg whitespace-nowrap z-10">
                                  Required by: {lockedByNames.join(', ')}
                                </div>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-foreground-secondary truncate">{stack.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Selection summary */}
              {(techStacks.length > 0 || inheritedStacks.length > 0) && (
                <div className="mt-2 text-xs text-foreground-secondary space-y-1">
                  {inheritedStacks.length > 0 && (
                    <div>
                      <span className="text-purple-400">Inherited:</span>{' '}
                      {inheritedStacks.map(id => getTechStack(id)?.name).filter(Boolean).join(', ')}
                    </div>
                  )}
                  {techStacks.length > 0 && (
                    <div>
                      <span className="text-primary">{effectiveParent ? 'Additional:' : 'Selected:'}</span>{' '}
                      {techStacks.map(id => getTechStack(id)?.name).filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Options */}
          {activeStep === 'options' && (
            <>
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
                  <span className="text-sm text-foreground">Set as default template</span>
                </label>
                <p className="text-xs text-foreground-tertiary mt-1">
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
                    <span className="text-sm text-foreground">Enable staging mode</span>
                  </label>
                  <p className="text-xs text-foreground-tertiary mt-1 ml-6">
                    Keep container running after provisioning for manual customization.
                    You can SSH into the container to install additional software before finalizing.
                  </p>
                </div>
              )}

              {/* Template Status Info - Edit mode only */}
              {isEditMode && template && (
                <div className="bg-background-tertiary/50 rounded p-3 text-sm">
                  <div className="text-foreground-secondary">Status: <span className="text-foreground capitalize">{template.status}</span></div>
                  {template.vmid && (
                    <div className="text-foreground-secondary">VMID: <span className="text-foreground">{template.vmid}</span></div>
                  )}
                  {template.node && (
                    <div className="text-foreground-secondary">Node: <span className="text-foreground">{template.node}</span></div>
                  )}
                  {template.baseCtTemplate && (
                    <div className="text-foreground-secondary">Base CT: <span className="text-foreground">{template.baseCtTemplate}</span></div>
                  )}
                  {template.errorMessage && (
                    <div className="text-error mt-2">Error: {template.errorMessage}</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Navigation */}
        {isEditMode ? (
          // Edit mode: Simple Save/Cancel buttons
          <div className="p-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-foreground-secondary hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
              className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 disabled:cursor-not-allowed rounded text-foreground transition-colors"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : (
          // Create/Clone mode: Wizard navigation
          <WizardNavigation
            onBack={handleBack}
            onNext={handleNext}
            onCancel={onClose}
            onFinish={handleSubmit}
            isFirstStep={activeStep === 'basic-info'}
            isLastStep={activeStep === 'options'}
            canProceed={canProceed()}
            isLoading={isLoading}
            finishLabel="Create Template"
          />
        )}
      </div>
    </div>
  );
}

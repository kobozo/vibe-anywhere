'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTabTemplates, TabTemplate } from '@/hooks/useTabTemplates';
import { getTemplateIcon } from '@/components/icons/ai-icons';
import type { TabType } from '@/lib/db/schema';

// Static tab definitions (Dashboard, Git, Docker)
interface StaticTabOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  tabType: TabType;
  requiredTechStack?: string;
  isStatic: true;
}

const STATIC_TABS: StaticTabOption[] = [
  {
    id: 'static-dashboard',
    name: 'Dashboard',
    icon: 'dashboard',
    description: 'Workspace overview and actions',
    tabType: 'dashboard',
    isStatic: true,
  },
  {
    id: 'static-git',
    name: 'Git',
    icon: 'git',
    description: 'Git status and operations',
    tabType: 'git',
    isStatic: true,
  },
  {
    id: 'static-docker',
    name: 'Docker',
    icon: 'docker',
    description: 'Container management',
    tabType: 'docker',
    requiredTechStack: 'docker',
    isStatic: true,
  },
];

// Union type for selection
type TabOption = StaticTabOption | (TabTemplate & { isStatic?: false });

interface CreateTabDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, templateId: string | null, args?: string[], tabType?: TabType) => Promise<void>;
  isLoading: boolean;
  workspaceTechStacks?: string[];
  existingTabTypes?: TabType[]; // To hide already-existing static tabs
}

export function CreateTabDialog({
  isOpen,
  onClose,
  onCreate,
  isLoading,
  workspaceTechStacks = [],
  existingTabTypes = [],
}: CreateTabDialogProps) {
  const { templates, fetchTemplates, isLoading: templatesLoading } = useTabTemplates();
  const [selectedOption, setSelectedOption] = useState<TabOption | null>(null);
  const [tabName, setTabName] = useState('');
  const [aiArgs, setAiArgs] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Filter and combine static tabs with dynamic templates
  const allOptions = useMemo(() => {
    // Filter static tabs: show if no requiredTechStack OR requiredTechStack is in workspaceTechStacks
    // Also hide static tabs that already exist in the workspace
    const filteredStaticTabs = STATIC_TABS.filter((tab) => {
      // Hide if tab type already exists
      if (existingTabTypes.includes(tab.tabType)) return false;
      // Check tech stack requirement
      if (!tab.requiredTechStack) return true;
      return workspaceTechStacks.includes(tab.requiredTechStack);
    });

    // Filter dynamic templates
    const filteredTemplates = templates.filter((template) => {
      if (!template.requiredTechStack) return true;
      return workspaceTechStacks.includes(template.requiredTechStack);
    });

    // Static tabs first, then dynamic templates
    return [...filteredStaticTabs, ...filteredTemplates.map(t => ({ ...t, isStatic: false as const }))];
  }, [templates, workspaceTechStacks, existingTabTypes]);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setSelectedOption(null);
      setTabName('');
      setAiArgs('');
      setError(null);
    }
  }, [isOpen, fetchTemplates]);

  // Auto-set tab name when option is selected
  useEffect(() => {
    if (selectedOption && !tabName) {
      setTabName(selectedOption.name);
    }
  }, [selectedOption, tabName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOption) {
      setError('Please select a tab type');
      return;
    }

    setError(null);

    try {
      if (selectedOption.isStatic) {
        // Static tab - pass tabType, no templateId
        await onCreate(tabName || selectedOption.name, null, undefined, selectedOption.tabType);
      } else {
        // Dynamic template - pass templateId
        let args: string[] | undefined;
        if (selectedOption.requiredTechStack && aiArgs.trim()) {
          args = aiArgs.split(/\s+/).filter(Boolean);
        }
        await onCreate(tabName || selectedOption.name, selectedOption.id, args);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tab');
    }
  };

  // Check if selected option is an AI assistant (for showing extra args input)
  const isAIAssistant = selectedOption && !selectedOption.isStatic &&
    selectedOption.requiredTechStack !== null && selectedOption.requiredTechStack !== undefined;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-2xl mx-4 max-h-[75vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">New Tab</h2>
          <button onClick={onClose} className="text-foreground-secondary hover:text-foreground text-xl">
            &times;
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-error/20 border border-error/50 rounded text-error text-sm">
              {error}
            </div>
          )}

          {/* Tab type selection */}
          <div>
            <label className="block text-sm text-foreground mb-2">Tab Type</label>
            {templatesLoading && templates.length === 0 ? (
              <div className="text-foreground-tertiary text-sm">Loading templates...</div>
            ) : allOptions.length === 0 ? (
              <div className="text-foreground-tertiary text-sm">No tab types available</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {allOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSelectedOption(option);
                        if (!tabName || tabName === selectedOption?.name) {
                          setTabName(option.name);
                        }
                      }}
                      className={`flex items-center gap-3 p-3 rounded border transition-colors text-left
                        ${selectedOption?.id === option.id
                          ? 'border-primary bg-primary/20'
                          : 'border-border-secondary bg-background-tertiary/50 hover:bg-background-tertiary'}`}
                    >
                      <div className="w-6 h-6 flex-shrink-0">
                        {getTemplateIcon(option.icon, option.isStatic || !!option.isBuiltIn, 'w-6 h-6 text-foreground')}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{option.name}</div>
                        {option.description && (
                          <div className="text-xs text-foreground-secondary">{option.description}</div>
                        )}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Tab name - only for dynamic templates, static tabs use fixed names */}
          {selectedOption && !selectedOption.isStatic && (
            <div>
              <label className="block text-sm text-foreground mb-1">Tab Name</label>
              <input
                type="text"
                value={tabName}
                onChange={(e) => setTabName(e.target.value)}
                placeholder={selectedOption?.name || 'My Tab'}
                className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary"
              />
            </div>
          )}

          {/* AI assistant extra arguments */}
          {isAIAssistant && (
            <div>
              <label className="block text-sm text-foreground mb-1">
                Arguments <span className="text-foreground-tertiary">(optional)</span>
              </label>
              <input
                type="text"
                value={aiArgs}
                onChange={(e) => setAiArgs(e.target.value)}
                placeholder="--print 'Hello' --dangerously-skip-permissions"
                className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary font-mono text-sm"
              />
              <p className="text-xs text-foreground-tertiary mt-1">
                Additional arguments to pass to {selectedOption?.name}
              </p>
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
            disabled={isLoading || !selectedOption}
            className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 disabled:cursor-not-allowed rounded text-foreground transition-colors"
          >
            {isLoading ? 'Creating...' : 'Create Tab'}
          </button>
        </div>
      </div>
    </div>
  );
}

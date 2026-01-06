'use client';

import { useState, useEffect } from 'react';
import { useTabTemplates, TabTemplate } from '@/hooks/useTabTemplates';

interface CreateTabDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, templateId: string, args?: string[]) => Promise<void>;
  isLoading: boolean;
}

const ICON_EMOJI: Record<string, string> = {
  bot: '\u{1F916}',
  git: '\u{1F500}',
  docker: '\u{1F433}',
  terminal: '\u{1F4BB}',
  code: '\u{1F4DD}',
  tool: '\u{1F527}',
};

export function CreateTabDialog({
  isOpen,
  onClose,
  onCreate,
  isLoading,
}: CreateTabDialogProps) {
  const { templates, fetchTemplates, isLoading: templatesLoading } = useTabTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState<TabTemplate | null>(null);
  const [tabName, setTabName] = useState('');
  const [claudeArgs, setClaudeArgs] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setSelectedTemplate(null);
      setTabName('');
      setClaudeArgs('');
      setError(null);
    }
  }, [isOpen, fetchTemplates]);

  // Auto-set tab name when template is selected
  useEffect(() => {
    if (selectedTemplate && !tabName) {
      setTabName(selectedTemplate.name);
    }
  }, [selectedTemplate, tabName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) {
      setError('Please select a tab type');
      return;
    }

    setError(null);

    try {
      // Parse Claude args if provided
      let args: string[] | undefined;
      if (selectedTemplate.command === 'claude' && claudeArgs.trim()) {
        args = claudeArgs.split(/\s+/).filter(Boolean);
      }

      await onCreate(tabName || selectedTemplate.name, selectedTemplate.id, args);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tab');
    }
  };

  const getIconEmoji = (icon: string) => ICON_EMOJI[icon] || '\u{1F4BB}';

  const isClaude = selectedTemplate?.command === 'claude';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-md">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">New Tab</h2>
          <button onClick={onClose} className="text-foreground-secondary hover:text-foreground text-xl">
            &times;
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-error/20 border border-error/50 rounded text-error text-sm">
              {error}
            </div>
          )}

          {/* Template selection */}
          <div>
            <label className="block text-sm text-foreground mb-2">Tab Type</label>
            {templatesLoading && templates.length === 0 ? (
              <div className="text-foreground-tertiary text-sm">Loading templates...</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplate(template);
                      if (!tabName || tabName === selectedTemplate?.name) {
                        setTabName(template.name);
                      }
                    }}
                    className={`flex items-center gap-3 p-3 rounded border transition-colors text-left
                      ${selectedTemplate?.id === template.id
                        ? 'border-primary bg-primary/20'
                        : 'border-border-secondary bg-background-tertiary/50 hover:bg-background-tertiary'}`}
                  >
                    <span className="text-2xl">{getIconEmoji(template.icon)}</span>
                    <div>
                      <div className="text-sm font-medium text-foreground">{template.name}</div>
                      {template.description && (
                        <div className="text-xs text-foreground-secondary">{template.description}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tab name */}
          <div>
            <label className="block text-sm text-foreground mb-1">Tab Name</label>
            <input
              type="text"
              value={tabName}
              onChange={(e) => setTabName(e.target.value)}
              placeholder={selectedTemplate?.name || 'My Tab'}
              className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary"
            />
          </div>

          {/* Claude-specific options */}
          {isClaude && (
            <div>
              <label className="block text-sm text-foreground mb-1">
                Claude Arguments <span className="text-foreground-tertiary">(optional)</span>
              </label>
              <input
                type="text"
                value={claudeArgs}
                onChange={(e) => setClaudeArgs(e.target.value)}
                placeholder="--print 'Hello' --dangerously-skip-permissions"
                className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-foreground placeholder-foreground-tertiary font-mono text-sm"
              />
              <p className="text-xs text-foreground-tertiary mt-1">
                Additional arguments to pass to the Claude CLI
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
            disabled={isLoading || !selectedTemplate}
            className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 disabled:cursor-not-allowed rounded text-foreground transition-colors"
          >
            {isLoading ? 'Creating...' : 'Create Tab'}
          </button>
        </div>
      </div>
    </div>
  );
}

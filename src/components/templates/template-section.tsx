'use client';

import { useState } from 'react';
import type { ProxmoxTemplate } from '@/lib/db/schema';

interface TemplateSectionProps {
  templates: ProxmoxTemplate[];
  isLoading: boolean;
  onAddTemplate: () => void;
  onSelectTemplate: (template: ProxmoxTemplate) => void;
}

export function TemplateSection({
  templates,
  isLoading,
  onAddTemplate,
  onSelectTemplate,
}: TemplateSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const getStatusIcon = (template: ProxmoxTemplate) => {
    switch (template.status) {
      case 'ready':
        return <span className="text-success">&#x2713;</span>;
      case 'provisioning':
        return <span className="animate-spin text-warning">&#x21BB;</span>;
      case 'staging':
        return <span className="text-primary">&#x25A0;</span>;
      case 'error':
        return <span className="text-error">&#x2717;</span>;
      case 'pending':
      default:
        return <span className="text-foreground-secondary">&#x25CB;</span>;
    }
  };

  const getStatusBorder = (template: ProxmoxTemplate) => {
    switch (template.status) {
      case 'ready':
        return 'border-l-2 border-l-green-500/50';
      case 'provisioning':
        return 'border-l-2 border-l-yellow-500/50 bg-yellow-500/5';
      case 'staging':
        return 'border-l-2 border-l-blue-500/50 bg-blue-500/5';
      case 'error':
        return 'border-l-2 border-l-red-500/50 bg-red-500/5';
      default:
        return 'border-l-2 border-l-foreground-tertiary/30';
    }
  };

  return (
    <div className="border-t border-border">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-foreground hover:text-foreground"
          >
            <span className="text-foreground-secondary text-xs w-4">
              {isExpanded ? '▾' : '▸'}
            </span>
            <h2 className="text-lg font-semibold">Templates</h2>
            <span className="text-xs text-foreground-tertiary ml-1">
              ({templates.length})
            </span>
          </button>
          <button
            onClick={onAddTemplate}
            className="px-3 py-1.5 bg-primary hover:bg-primary-hover rounded text-sm text-foreground transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Template List */}
      {isExpanded && (
        <div className="p-2 max-h-64 overflow-y-auto">
          {isLoading && templates.length === 0 && (
            <div className="text-center text-foreground-secondary py-4">Loading templates...</div>
          )}

          {!isLoading && templates.length === 0 && (
            <div className="text-center text-foreground-secondary py-4">
              <p>No templates yet.</p>
              <p className="text-sm mt-1">Add a template to get started.</p>
            </div>
          )}

          {templates.map((template) => (
            <div
              key={template.id}
              onClick={() => onSelectTemplate(template)}
              className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer hover:bg-background-tertiary/50 ${getStatusBorder(template)}`}
            >
              <span className="text-sm w-5 flex justify-center">
                {getStatusIcon(template)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-200 truncate">{template.name}</span>
                  {template.isDefault && (
                    <span className="text-xs bg-primary/30 text-primary px-1.5 py-0.5 rounded">
                      Default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {/* Status text */}
                  <span className={`text-xs ${
                    template.status === 'ready' ? 'text-success/70' :
                    template.status === 'provisioning' ? 'text-warning/70' :
                    template.status === 'staging' ? 'text-primary/70' :
                    template.status === 'error' ? 'text-error/70' :
                    'text-foreground-tertiary'
                  }`}>
                    {template.status === 'ready' && template.vmid ? `VMID: ${template.vmid}` :
                     template.status === 'provisioning' ? 'Provisioning...' :
                     template.status === 'staging' ? `Staging (${template.stagingContainerIp || 'connecting...'})` :
                     template.status === 'error' ? 'Failed - click for details' :
                     'Not provisioned'}
                  </span>
                </div>
                {/* Tech stacks preview */}
                {template.techStacks && template.techStacks.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(template.techStacks as string[]).slice(0, 3).map((stack) => (
                      <span
                        key={stack}
                        className="text-xs bg-background-tertiary text-foreground-secondary px-1 py-0.5 rounded"
                      >
                        {stack}
                      </span>
                    ))}
                    {template.techStacks.length > 3 && (
                      <span className="text-xs text-foreground-tertiary">
                        +{template.techStacks.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* Click indicator */}
              <span className="text-foreground-tertiary text-xs">
                &#x276F;
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import type { ProxmoxTemplate } from '@/lib/db/schema';
import type { ProvisionProgress } from '@/hooks/useTemplates';

interface TemplateProvisioningModalProps {
  isOpen: boolean;
  template: ProxmoxTemplate | null;
  progress: ProvisionProgress | null;
  isProvisioning: boolean;
  error: string | null;
  onClose: () => void;
}

export function TemplateProvisioningModal({
  isOpen,
  template,
  progress,
  isProvisioning,
  error,
  onClose,
}: TemplateProvisioningModalProps) {
  if (!isOpen || !template) return null;

  const progressPercent = progress?.progress ?? 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-full max-w-md mx-4 h-[300px] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {isProvisioning ? 'Provisioning Template' : error ? 'Provisioning Failed' : 'Provisioning Complete'}
          </h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <div className="text-foreground-secondary mb-1">Template: <span className="text-foreground">{template.name}</span></div>
            {template.techStacks && template.techStacks.length > 0 && (
              <div className="text-foreground-secondary text-sm">
                Tech stacks: {template.techStacks.join(', ')}
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-sm text-foreground-secondary mb-1">
              <span>{progress?.step || 'Starting...'}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 bg-background-input rounded overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  error ? 'bg-error' : 'bg-primary'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Status Message */}
          <div className={`text-sm ${error ? 'text-error' : 'text-foreground-secondary'}`}>
            {error || progress?.message || 'Preparing...'}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end">
          {!isProvisioning && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-background-tertiary hover:bg-background-input text-foreground rounded transition-colors"
            >
              Close
            </button>
          )}
          {isProvisioning && (
            <div className="text-foreground-secondary text-sm flex items-center gap-2">
              <span className="animate-spin">&#x21BB;</span>
              Please wait...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

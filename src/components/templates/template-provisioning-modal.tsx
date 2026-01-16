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
      <div className="bg-gray-800 rounded-lg w-full max-w-md mx-4">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            {isProvisioning ? 'Provisioning Template' : error ? 'Provisioning Failed' : 'Provisioning Complete'}
          </h2>

          <div className="mb-4">
            <div className="text-gray-400 mb-1">Template: <span className="text-white">{template.name}</span></div>
            {(() => {
              const techStacks = Array.isArray(template.techStacks) ? template.techStacks : [];
              return techStacks.length > 0 && (
                <div className="text-gray-400 text-sm">
                  Tech stacks: {techStacks.join(', ')}
                </div>
              );
            })()}
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>{progress?.step || 'Starting...'}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  error ? 'bg-red-500' : 'bg-blue-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Status Message */}
          <div className={`text-sm ${error ? 'text-red-400' : 'text-gray-400'}`}>
            {error || progress?.message || 'Preparing...'}
          </div>

          {/* Actions */}
          <div className="flex justify-end mt-6">
            {!isProvisioning && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
              >
                Close
              </button>
            )}
            {isProvisioning && (
              <div className="text-gray-400 text-sm flex items-center gap-2">
                <span className="animate-spin">&#x21BB;</span>
                Please wait...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

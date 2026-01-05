'use client';

import { useState } from 'react';
import type { ProxmoxTemplate } from '@/lib/db/schema';
import type { ProvisionProgress } from '@/hooks/useTemplates';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface TemplateDetailsModalProps {
  isOpen: boolean;
  template: ProxmoxTemplate | null;
  onClose: () => void;
  onEdit: (template: ProxmoxTemplate) => void;
  onProvision: (template: ProxmoxTemplate) => void;
  onRecreate: (template: ProxmoxTemplate) => void;
  onDelete: (templateId: string) => Promise<void>;
  // Provisioning state (passed from parent)
  isProvisioning?: boolean;
  provisionProgress?: ProvisionProgress | null;
  provisionError?: string | null;
}

export function TemplateDetailsModal({
  isOpen,
  template,
  onClose,
  onEdit,
  onProvision,
  onRecreate,
  onDelete,
  isProvisioning = false,
  provisionProgress = null,
  provisionError = null,
}: TemplateDetailsModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !template) return null;

  const getStatusColor = () => {
    switch (template.status) {
      case 'ready': return 'text-green-400';
      case 'provisioning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusBgColor = () => {
    switch (template.status) {
      case 'ready': return 'bg-green-500/20';
      case 'provisioning': return 'bg-yellow-500/20';
      case 'error': return 'bg-red-500/20';
      default: return 'bg-gray-500/20';
    }
  };

  const getStatusText = () => {
    switch (template.status) {
      case 'ready': return 'Ready';
      case 'provisioning': return 'Provisioning...';
      case 'error': return 'Error';
      default: return 'Not Provisioned';
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(template.id);
      onClose();
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const progressPercent = provisionProgress?.progress ?? 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{template.name}</h2>
                {template.description && (
                  <p className="text-gray-400 text-sm mt-1">{template.description}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white text-xl"
              >
                &times;
              </button>
            </div>

            {/* Status Badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${getStatusBgColor()} mb-4`}>
              {template.status === 'provisioning' || isProvisioning ? (
                <span className="animate-spin text-yellow-400">&#x21BB;</span>
              ) : template.status === 'ready' ? (
                <span className="text-green-400">&#x2713;</span>
              ) : template.status === 'error' ? (
                <span className="text-red-400">&#x2717;</span>
              ) : (
                <span className="text-gray-400">&#x25CB;</span>
              )}
              <span className={`font-medium ${getStatusColor()}`}>
                {isProvisioning ? 'Provisioning...' : getStatusText()}
              </span>
            </div>

            {/* Provisioning Progress */}
            {(isProvisioning || template.status === 'provisioning') && (
              <div className="mb-4 p-3 bg-gray-700/50 rounded">
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>{provisionProgress?.step || 'Starting...'}</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-2 bg-gray-600 rounded overflow-hidden">
                  <div
                    className="h-full bg-yellow-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {provisionProgress?.message && (
                  <p className="text-sm text-gray-400 mt-2">{provisionProgress.message}</p>
                )}
              </div>
            )}

            {/* Error Message */}
            {(template.status === 'error' || provisionError) && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded">
                <div className="flex items-start gap-2">
                  <span className="text-red-400">&#x26A0;</span>
                  <div>
                    <p className="text-red-400 font-medium">Provisioning Failed</p>
                    <p className="text-sm text-red-300 mt-1">
                      {provisionError || template.errorMessage || 'Unknown error occurred'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Template Info */}
            <div className="space-y-3 mb-6">
              {/* VMID */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">VMID</span>
                <span className="text-white">
                  {template.vmid || <span className="text-gray-500">Not assigned</span>}
                </span>
              </div>

              {/* Node */}
              {template.node && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Node</span>
                  <span className="text-white">{template.node}</span>
                </div>
              )}

              {/* Storage */}
              {template.storage && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Storage</span>
                  <span className="text-white">{template.storage}</span>
                </div>
              )}

              {/* Default */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Default Template</span>
                <span className={template.isDefault ? 'text-blue-400' : 'text-gray-500'}>
                  {template.isDefault ? 'Yes' : 'No'}
                </span>
              </div>

              {/* Tech Stacks */}
              {template.techStacks && template.techStacks.length > 0 && (
                <div>
                  <span className="text-gray-400 text-sm">Tech Stacks</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(template.techStacks as string[]).map((stack) => (
                      <span
                        key={stack}
                        className="px-2 py-1 bg-purple-500/20 text-purple-400 text-sm rounded"
                      >
                        {stack}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-700">
              {/* Edit - always available */}
              <button
                onClick={() => onEdit(template)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
                disabled={isProvisioning}
              >
                Edit
              </button>

              {/* Provision - for pending or error status */}
              {(template.status === 'pending' || template.status === 'error') && !isProvisioning && (
                <button
                  onClick={() => onProvision(template)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
                >
                  {template.status === 'error' ? 'Retry Provision' : 'Provision'}
                </button>
              )}

              {/* Recreate - for ready status */}
              {template.status === 'ready' && !isProvisioning && (
                <button
                  onClick={() => onRecreate(template)}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded transition-colors"
                >
                  Recreate
                </button>
              )}

              {/* Delete - always available but disabled during provisioning */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded transition-colors disabled:opacity-50"
                disabled={isProvisioning}
              >
                Delete
              </button>

              <div className="flex-1" />

              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Template"
        message={`Delete template "${template.name}"? ${
          template.status === 'ready'
            ? `This will NOT delete the Proxmox template (VMID ${template.vmid}).`
            : ''
        } Repositories using this template will have no template assigned.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        isLoading={isDeleting}
      />
    </>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import type { ProxmoxTemplate } from '@/lib/db/schema';
import type { ProvisionProgress, LogEntry } from '@/hooks/useTemplates';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface TemplateDetailsModalProps {
  isOpen: boolean;
  template: ProxmoxTemplate | null;
  templates?: ProxmoxTemplate[]; // All templates (to find parent by ID)
  onClose: () => void;
  onEdit: (template: ProxmoxTemplate) => void;
  onProvision: (template: ProxmoxTemplate) => void;
  onRecreate: (template: ProxmoxTemplate) => void;
  onDelete: (templateId: string) => Promise<void>;
  onClone?: (template: ProxmoxTemplate) => void; // Clone this template
  onOpenStagingTerminal?: (template: ProxmoxTemplate) => void;
  onFinalize?: (template: ProxmoxTemplate) => void;
  // Provisioning state (passed from parent)
  isProvisioning?: boolean;
  provisionProgress?: ProvisionProgress | null;
  provisionError?: string | null;
  provisionLogs?: LogEntry[];
}

export function TemplateDetailsModal({
  isOpen,
  template,
  templates = [],
  onClose,
  onEdit,
  onProvision,
  onRecreate,
  onDelete,
  onClone,
  onOpenStagingTerminal,
  onFinalize,
  isProvisioning = false,
  provisionProgress = null,
  provisionError = null,
  provisionLogs = [],
}: TemplateDetailsModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const hasAutoExpandedRef = useRef(false);

  // Find parent template if this template has one
  const parentTemplate = template?.parentTemplateId
    ? templates.find((t) => t.id === template.parentTemplateId)
    : null;

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [provisionLogs, showLogs]);

  // Reset auto-expand tracking when provisioning stops
  useEffect(() => {
    if (!isProvisioning) {
      hasAutoExpandedRef.current = false;
    }
  }, [isProvisioning]);

  // Auto-expand logs once when provisioning starts (user can minimize and it stays minimized)
  useEffect(() => {
    if (isProvisioning && provisionLogs.length > 0 && !hasAutoExpandedRef.current) {
      setShowLogs(true);
      hasAutoExpandedRef.current = true;
    }
  }, [isProvisioning, provisionLogs.length]);

  if (!isOpen || !template) return null;

  const getStatusColor = () => {
    switch (template.status) {
      case 'ready': return 'text-success';
      case 'provisioning': return 'text-warning';
      case 'staging': return 'text-primary';
      case 'error': return 'text-error';
      default: return 'text-foreground-secondary';
    }
  };

  const getStatusBgColor = () => {
    switch (template.status) {
      case 'ready': return 'bg-green-500/20';
      case 'provisioning': return 'bg-yellow-500/20';
      case 'staging': return 'bg-blue-500/20';
      case 'error': return 'bg-red-500/20';
      default: return 'bg-gray-500/20';
    }
  };

  const getStatusText = () => {
    switch (template.status) {
      case 'ready': return 'Ready';
      case 'provisioning': return 'Provisioning...';
      case 'staging': return 'Staging';
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
        <div className="bg-background-secondary rounded-lg w-full max-w-2xl mx-4 max-h-[75vh] overflow-y-auto">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">{template.name}</h2>
                {template.description && (
                  <p className="text-foreground-secondary text-sm mt-1">{template.description}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-foreground-secondary hover:text-foreground text-xl"
              >
                &times;
              </button>
            </div>

            {/* Status Badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${getStatusBgColor()} mb-4`}>
              {template.status === 'provisioning' || isProvisioning ? (
                <span className="animate-spin text-warning">&#x21BB;</span>
              ) : template.status === 'ready' ? (
                <span className="text-success">&#x2713;</span>
              ) : template.status === 'staging' ? (
                <span className="text-primary">&#x25A0;</span>
              ) : template.status === 'error' ? (
                <span className="text-error">&#x2717;</span>
              ) : (
                <span className="text-foreground-secondary">&#x25CB;</span>
              )}
              <span className={`font-medium ${getStatusColor()}`}>
                {isProvisioning ? 'Provisioning...' : getStatusText()}
              </span>
            </div>

            {/* Staging Info */}
            {template.status === 'staging' && template.stagingContainerIp && (
              <div className="mb-4 p-3 bg-primary/10 border border-primary/30 rounded">
                <div className="flex items-start gap-2">
                  <span className="text-primary">&#x2139;</span>
                  <div>
                    <p className="text-primary font-medium">Container Running in Staging Mode</p>
                    <p className="text-sm text-primary-hover mt-1">
                      IP: {template.stagingContainerIp} | VMID: {template.vmid}
                    </p>
                    <p className="text-sm text-foreground-secondary mt-1">
                      Open the terminal to customize, then finalize to convert to template.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Provisioning Progress */}
            {(isProvisioning || template.status === 'provisioning') && (
              <div className="mb-4 p-3 bg-background-tertiary/50 rounded">
                <div className="flex justify-between text-sm text-foreground-secondary mb-2">
                  <span>{provisionProgress?.step || 'Starting...'}</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-2 bg-background-input rounded overflow-hidden">
                  <div
                    className="h-full bg-warning transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {provisionProgress?.message && (
                  <p className="text-sm text-foreground-secondary mt-2">{provisionProgress.message}</p>
                )}

                {/* Expandable Logs Panel */}
                {provisionLogs.length > 0 && (
                  <div className="mt-3 border-t border-border-secondary pt-3">
                    <button
                      onClick={() => setShowLogs(!showLogs)}
                      className="flex items-center gap-2 text-sm text-foreground-secondary hover:text-foreground transition-colors"
                    >
                      <span className={`transform transition-transform ${showLogs ? 'rotate-90' : ''}`}>
                        &#x25B6;
                      </span>
                      <span>{showLogs ? 'Hide' : 'Show'} Installation Logs ({provisionLogs.length} lines)</span>
                    </button>

                    {showLogs && (
                      <div className="mt-2 bg-background rounded border border-border max-h-64 overflow-y-auto font-mono text-xs">
                        {provisionLogs.map((log, index) => (
                          <div
                            key={index}
                            className={`px-2 py-0.5 ${
                              log.type === 'stderr' ? 'text-error bg-error/10' : 'text-foreground'
                            } whitespace-pre-wrap break-all`}
                          >
                            {log.content}
                          </div>
                        ))}
                        <div ref={logsEndRef} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {(template.status === 'error' || provisionError) && (
              <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded">
                <div className="flex items-start gap-2">
                  <span className="text-error">&#x26A0;</span>
                  <div>
                    <p className="text-error font-medium">Provisioning Failed</p>
                    <p className="text-sm text-error/80 mt-1">
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
                <span className="text-foreground-secondary">VMID</span>
                <span className="text-foreground">
                  {template.vmid || <span className="text-foreground-tertiary">Not assigned</span>}
                </span>
              </div>

              {/* Node */}
              {template.node && (
                <div className="flex justify-between text-sm">
                  <span className="text-foreground-secondary">Node</span>
                  <span className="text-foreground">{template.node}</span>
                </div>
              )}

              {/* Storage */}
              {template.storage && (
                <div className="flex justify-between text-sm">
                  <span className="text-foreground-secondary">Storage</span>
                  <span className="text-foreground">{template.storage}</span>
                </div>
              )}

              {/* Default */}
              <div className="flex justify-between text-sm">
                <span className="text-foreground-secondary">Default Template</span>
                <span className={template.isDefault ? 'text-primary' : 'text-foreground-tertiary'}>
                  {template.isDefault ? 'Yes' : 'No'}
                </span>
              </div>

              {/* Parent Template (for cloned templates) */}
              {template.parentTemplateId && (
                <div className="flex justify-between text-sm">
                  <span className="text-foreground-secondary">Based On</span>
                  <span className="text-purple-400">
                    {parentTemplate?.name || 'Unknown'}
                  </span>
                </div>
              )}

              {/* Inherited Tech Stacks */}
              {template.inheritedTechStacks && template.inheritedTechStacks.length > 0 && (
                <div>
                  <span className="text-foreground-secondary text-sm">Inherited Tech Stacks</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(template.inheritedTechStacks as string[]).map((stack) => (
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

              {/* Tech Stacks (own stacks, not inherited) */}
              {template.techStacks && template.techStacks.length > 0 && (
                <div>
                  <span className="text-foreground-secondary text-sm">
                    {template.inheritedTechStacks && template.inheritedTechStacks.length > 0
                      ? 'Additional Tech Stacks'
                      : 'Tech Stacks'}
                  </span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(template.techStacks as string[]).map((stack) => (
                      <span
                        key={stack}
                        className="px-2 py-1 bg-primary/20 text-primary text-sm rounded"
                      >
                        {stack}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
              {/* Edit - always available */}
              <button
                onClick={() => onEdit(template)}
                className="px-4 py-2 bg-background-input hover:bg-foreground-tertiary text-foreground rounded transition-colors"
                disabled={isProvisioning}
              >
                Edit
              </button>

              {/* Provision - for pending or error status */}
              {(template.status === 'pending' || template.status === 'error') && !isProvisioning && (
                <button
                  onClick={() => onProvision(template)}
                  className="px-4 py-2 bg-success hover:bg-success/80 text-foreground rounded transition-colors"
                >
                  {template.status === 'error' ? 'Retry Provision' : 'Provision'}
                </button>
              )}

              {/* Staging actions - Open Terminal and Finalize */}
              {template.status === 'staging' && !isProvisioning && (
                <>
                  {onOpenStagingTerminal && (
                    <button
                      onClick={() => onOpenStagingTerminal(template)}
                      className="px-4 py-2 bg-primary hover:bg-primary-hover text-foreground rounded transition-colors"
                    >
                      Open Terminal
                    </button>
                  )}
                  {onFinalize && (
                    <button
                      onClick={() => onFinalize(template)}
                      className="px-4 py-2 bg-success hover:bg-success/80 text-foreground rounded transition-colors"
                    >
                      Finalize
                    </button>
                  )}
                </>
              )}

              {/* Clone - for ready status */}
              {template.status === 'ready' && !isProvisioning && onClone && (
                <button
                  onClick={() => onClone(template)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-foreground rounded transition-colors"
                >
                  Clone
                </button>
              )}

              {/* Recreate - for ready status */}
              {template.status === 'ready' && !isProvisioning && (
                <button
                  onClick={() => onRecreate(template)}
                  className="px-4 py-2 bg-warning hover:bg-warning/80 text-foreground rounded transition-colors"
                >
                  Recreate
                </button>
              )}

              {/* Delete - always available but disabled during provisioning */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-error hover:bg-error/80 text-foreground rounded transition-colors disabled:opacity-50"
                disabled={isProvisioning}
              >
                Delete
              </button>

              <div className="flex-1" />

              <button
                onClick={onClose}
                className="px-4 py-2 text-foreground-secondary hover:text-foreground transition-colors"
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

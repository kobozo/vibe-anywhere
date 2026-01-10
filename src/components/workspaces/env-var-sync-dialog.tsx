'use client';

import { useEffect, useRef } from 'react';
import type { EnvVarDiff, ContainerOperation, EnvVarDiffDetails } from '@/types/env-sync';
import { operationLabels } from '@/types/env-sync';

interface EnvVarSyncDialogProps {
  isOpen: boolean;
  workspaceName: string;
  operation: ContainerOperation;
  diff: EnvVarDiff | null;
  onSyncAndProceed: () => void;
  onProceedWithoutSync: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * Dialog for handling env var sync before container operations.
 * Shows diff details and offers three options:
 * - Sync & Proceed: Sync workspace .env to repository, then do operation
 * - Proceed Without Sync: Do operation without syncing
 * - Cancel: Abort operation
 */
export function EnvVarSyncDialog({
  isOpen,
  workspaceName,
  operation,
  diff,
  onSyncAndProceed,
  onProceedWithoutSync,
  onCancel,
  isLoading = false,
}: EnvVarSyncDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || isLoading) return;
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen || !diff) return null;

  const { action } = operationLabels[operation];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={!isLoading ? onCancel : undefined}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative bg-background-secondary border border-border rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[75vh] flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">
            Environment Variables Out of Sync
          </h3>
        </div>

        {/* Content */}
        <div className="p-4 overflow-auto flex-1">
          <p className="text-foreground mb-4">
            The <code className="px-1.5 py-0.5 bg-background rounded text-sm font-mono">.env</code> file
            in workspace &quot;{workspaceName}&quot; has changes that are not saved to the repository.
          </p>

          {/* Summary */}
          <DiffSummary diff={diff.diff} />

          {/* Details */}
          {(diff.diff.added.length > 0 || diff.diff.removed.length > 0 || diff.diff.changed.length > 0) && (
            <DiffDetails
              diff={diff.diff}
              workspaceVars={diff.workspaceVars}
              repoVars={diff.repoVars}
            />
          )}

          <p className="text-foreground-secondary text-sm mt-4">
            What would you like to do before {operationLabels[operation].verb}?
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 bg-background-tertiary hover:bg-background-input text-foreground rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onProceedWithoutSync}
            disabled={isLoading}
            className="px-4 py-2 bg-warning hover:bg-warning/80 text-black rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {action} Without Sync
          </button>
          <button
            onClick={onSyncAndProceed}
            disabled={isLoading}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-foreground rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Syncing...' : `Sync & ${action}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Summary of diff (X added, Y removed, Z changed)
 */
function DiffSummary({ diff }: { diff: EnvVarDiffDetails }) {
  const parts: string[] = [];
  if (diff.added.length > 0) {
    parts.push(`${diff.added.length} added`);
  }
  if (diff.removed.length > 0) {
    parts.push(`${diff.removed.length} removed`);
  }
  if (diff.changed.length > 0) {
    parts.push(`${diff.changed.length} changed`);
  }

  return (
    <div className="bg-background rounded-lg p-3 mb-4">
      <div className="text-sm font-medium text-foreground mb-1">Summary</div>
      <div className="text-sm text-foreground-secondary">
        {parts.join(', ')} from repository configuration
      </div>
    </div>
  );
}

/**
 * Detailed view of what changed
 */
function DiffDetails({
  diff,
  workspaceVars,
  repoVars,
}: {
  diff: EnvVarDiffDetails;
  workspaceVars: Record<string, string>;
  repoVars: Record<string, string>;
}) {
  const isSensitive = (key: string) =>
    /SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE|CREDENTIAL|AUTH/i.test(key);

  const maskValue = (key: string, value: string) =>
    isSensitive(key) ? '••••••••' : truncateValue(value);

  const truncateValue = (value: string, maxLen = 40) =>
    value.length > maxLen ? value.substring(0, maxLen) + '...' : value;

  return (
    <div className="bg-background rounded-lg p-3 max-h-48 overflow-auto">
      <div className="text-sm font-medium text-foreground mb-2">Details</div>
      <div className="space-y-1 font-mono text-xs">
        {/* Added variables */}
        {diff.added.map((key) => (
          <div key={`add-${key}`} className="flex items-start gap-2">
            <span className="text-success font-bold">+</span>
            <span className="text-foreground">{key}</span>
            <span className="text-foreground-tertiary">=</span>
            <span className="text-success break-all">
              {maskValue(key, workspaceVars[key] || '')}
            </span>
          </div>
        ))}

        {/* Removed variables */}
        {diff.removed.map((key) => (
          <div key={`rem-${key}`} className="flex items-start gap-2">
            <span className="text-error font-bold">-</span>
            <span className="text-foreground">{key}</span>
            <span className="text-foreground-tertiary">=</span>
            <span className="text-error break-all">
              {maskValue(key, repoVars[key] || '')}
            </span>
          </div>
        ))}

        {/* Changed variables */}
        {diff.changed.map((key) => (
          <div key={`chg-${key}`} className="flex flex-col gap-0.5">
            <div className="flex items-start gap-2">
              <span className="text-warning font-bold">~</span>
              <span className="text-foreground">{key}</span>
              <span className="text-foreground-tertiary">=</span>
              <span className="text-warning break-all">
                {maskValue(key, workspaceVars[key] || '')}
              </span>
            </div>
            <div className="ml-4 text-foreground-tertiary text-xs">
              was: {maskValue(key, repoVars[key] || '')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

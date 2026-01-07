'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'default',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        onConfirm();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  const confirmButtonClass = {
    danger: 'bg-error hover:bg-error/80',
    warning: 'bg-warning hover:bg-warning/80',
    default: 'bg-primary hover:bg-primary-hover',
  }[confirmVariant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative bg-background-secondary border border-border rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
      >
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <div className="text-foreground mb-6">{message}</div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 bg-background-tertiary hover:bg-background-input text-foreground rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-foreground rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${confirmButtonClass}`}
          >
            {isLoading ? 'Loading...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

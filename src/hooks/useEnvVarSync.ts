'use client';

import { useState, useCallback } from 'react';
import type { EnvVarDiff, ContainerOperation } from '@/types/env-sync';

interface UseEnvVarSyncResult {
  /** Whether currently checking for differences */
  isChecking: boolean;
  /** Whether currently syncing env vars */
  isSyncing: boolean;
  /** Whether the dialog is open */
  isDialogOpen: boolean;
  /** Current diff result (if differences found) */
  diff: EnvVarDiff | null;
  /** Current operation being checked */
  operation: ContainerOperation | null;
  /** Check for env var differences before an operation */
  checkBeforeOperation: (
    workspaceId: string,
    operation: ContainerOperation,
    onProceed: () => Promise<void>
  ) => Promise<void>;
  /** Handle user choosing "Sync & Proceed" */
  handleSyncAndProceed: () => void;
  /** Handle user choosing "Proceed Without Sync" */
  handleProceedWithoutSync: () => void;
  /** Handle user choosing "Cancel" */
  handleCancel: () => void;
}

/**
 * Hook to check for env var differences before container operations.
 * Orchestrates the flow: check -> show dialog (if diff) -> sync/proceed/cancel
 */
export function useEnvVarSync(): UseEnvVarSyncResult {
  const [isChecking, setIsChecking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [diff, setDiff] = useState<EnvVarDiff | null>(null);
  const [operation, setOperation] = useState<ContainerOperation | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [pendingCallback, setPendingCallback] = useState<(() => Promise<void>) | null>(null);

  const getAuthToken = () => localStorage.getItem('auth_token');

  const checkBeforeOperation = useCallback(async (
    wsId: string,
    op: ContainerOperation,
    onProceed: () => Promise<void>
  ) => {
    setIsChecking(true);
    setWorkspaceId(wsId);
    setOperation(op);
    setPendingCallback(() => onProceed);

    try {
      const response = await fetch(`/api/workspaces/${wsId}/env-diff`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (!response.ok) {
        // On error, proceed without showing dialog
        console.error('Failed to check env diff, proceeding with operation');
        await onProceed();
        return;
      }

      const { data } = await response.json();
      const envDiff = data as EnvVarDiff;

      if (envDiff.hasDifferences) {
        // Show dialog
        setDiff(envDiff);
        setIsDialogOpen(true);
      } else {
        // No differences, proceed immediately
        await onProceed();
        resetState();
      }
    } catch (error) {
      console.error('Error checking env diff:', error);
      // On error, proceed without showing dialog
      await onProceed();
      resetState();
    } finally {
      setIsChecking(false);
    }
  }, []);

  const resetState = useCallback(() => {
    setIsDialogOpen(false);
    setDiff(null);
    setOperation(null);
    setWorkspaceId(null);
    setPendingCallback(null);
  }, []);

  const handleSyncAndProceed = useCallback(async () => {
    if (!workspaceId || !pendingCallback) return;

    setIsSyncing(true);
    try {
      // Sync env vars from workspace to repository
      const response = await fetch(`/api/workspaces/${workspaceId}/env-file`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (!response.ok) {
        console.error('Failed to sync env vars');
        // Still proceed even if sync fails - user explicitly chose to proceed
      }

      // Proceed with the operation
      await pendingCallback();
    } catch (error) {
      console.error('Error during sync and proceed:', error);
    } finally {
      setIsSyncing(false);
      resetState();
    }
  }, [workspaceId, pendingCallback, resetState]);

  const handleProceedWithoutSync = useCallback(async () => {
    if (!pendingCallback) return;

    try {
      await pendingCallback();
    } catch (error) {
      console.error('Error proceeding without sync:', error);
    } finally {
      resetState();
    }
  }, [pendingCallback, resetState]);

  const handleCancel = useCallback(() => {
    resetState();
  }, [resetState]);

  return {
    isChecking,
    isSyncing,
    isDialogOpen,
    diff,
    operation,
    checkBeforeOperation,
    handleSyncAndProceed,
    handleProceedWithoutSync,
    handleCancel,
  };
}

/**
 * In-memory store for tracking workspace startup progress
 */

import {
  StartupProgress,
  StartupStep,
  STARTUP_STEPS,
  getStepIndex,
} from '@/lib/types/startup-progress';

class StartupProgressStore {
  private progressMap = new Map<string, StartupProgress>();

  /**
   * Set progress for a workspace
   */
  setProgress(
    workspaceId: string,
    step: StartupStep,
    message?: string
  ): StartupProgress {
    const existing = this.progressMap.get(workspaceId);
    const progress: StartupProgress = {
      workspaceId,
      currentStep: step,
      stepIndex: getStepIndex(step),
      totalSteps: STARTUP_STEPS.length,
      message,
      startedAt: existing?.startedAt ?? Date.now(),
    };
    this.progressMap.set(workspaceId, progress);
    return progress;
  }

  /**
   * Get progress for a workspace
   */
  getProgress(workspaceId: string): StartupProgress | undefined {
    return this.progressMap.get(workspaceId);
  }

  /**
   * Set error for a workspace startup
   */
  setError(workspaceId: string, error: string): StartupProgress | undefined {
    const existing = this.progressMap.get(workspaceId);
    if (existing) {
      existing.error = error;
      this.progressMap.set(workspaceId, existing);
    }
    return existing;
  }

  /**
   * Clear progress for a workspace (e.g., on successful completion or reset)
   */
  clearProgress(workspaceId: string): void {
    this.progressMap.delete(workspaceId);
  }

  /**
   * Check if a workspace is currently starting
   */
  isStarting(workspaceId: string): boolean {
    const progress = this.progressMap.get(workspaceId);
    return progress !== undefined && !progress.error && progress.currentStep !== 'ready';
  }

  /**
   * Get all active startup progresses
   */
  getAllProgress(): StartupProgress[] {
    return Array.from(this.progressMap.values());
  }
}

// Singleton instance
export const startupProgressStore = new StartupProgressStore();

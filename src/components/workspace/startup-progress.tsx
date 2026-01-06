'use client';

import { useState, useEffect } from 'react';
import { useStartupProgress } from '@/hooks/useStartupProgress';
import { STARTUP_STEPS, getStepLabel, type StartupStep } from '@/lib/types/startup-progress';

interface StartupProgressProps {
  workspaceId: string;
  onRetry?: () => void;
}

// Simulated step durations in seconds (approximate)
const STEP_DURATIONS: Record<StartupStep, number> = {
  initializing: 2,
  creating_container: 10,
  starting_container: 5,
  configuring_network: 5,
  cloning_repository: 15,
  installing_tech_stack: 20,
  starting_agent: 5,
  connecting: 10,
  ready: 0,
};

export function StartupProgress({ workspaceId, onRetry }: StartupProgressProps) {
  const { progress, elapsedTime: wsElapsedTime, hasError } = useStartupProgress({
    workspaceId,
  });

  // Local elapsed time for when WebSocket progress isn't available
  const [localStartTime] = useState(() => Date.now());
  const [localElapsedTime, setLocalElapsedTime] = useState(0);

  // Update local elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      setLocalElapsedTime(Math.floor((Date.now() - localStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [localStartTime]);

  // Use WebSocket elapsed time if available, otherwise use local
  const elapsedTime = progress ? wsElapsedTime : localElapsedTime;

  // Calculate simulated step index based on elapsed time
  const getSimulatedStepIndex = (elapsed: number): number => {
    let accumulatedTime = 0;
    for (let i = 0; i < STARTUP_STEPS.length - 1; i++) {
      accumulatedTime += STEP_DURATIONS[STARTUP_STEPS[i].step];
      if (elapsed < accumulatedTime) {
        return i;
      }
    }
    return STARTUP_STEPS.length - 2; // connecting step
  };

  // Format elapsed time as mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Filter out 'ready' step from display
  const displaySteps = STARTUP_STEPS.filter((s) => s.step !== 'ready');

  // Determine current step index - use real progress if available, otherwise simulate
  const currentStepIndex = progress ? progress.stepIndex : getSimulatedStepIndex(localElapsedTime);
  const currentError = progress?.error;
  const showError = hasError && currentError;

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-background-secondary text-foreground-tertiary gap-4">
      <div className="w-full max-w-sm px-6">
        <h3 className="text-lg font-medium text-foreground-secondary text-center mb-6">
          {showError ? 'Startup Failed' : 'Starting Workspace'}
        </h3>

        <div className="space-y-3">
          {displaySteps.map((stepInfo, index) => {
            const isCompleted = currentStepIndex > index;
            const isCurrent = currentStepIndex === index && !showError;
            const isFailed = currentStepIndex === index && showError;

            return (
              <div
                key={stepInfo.step}
                className={`flex items-center gap-3 ${
                  isCurrent ? 'text-foreground' : isCompleted ? 'text-foreground-secondary' : 'text-foreground-tertiary'
                }`}
              >
                {/* Status indicator */}
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {isCompleted && (
                    <svg
                      className="w-4 h-4 text-success"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  {isCurrent && (
                    <div className="w-3 h-3 rounded-full bg-warning animate-pulse" />
                  )}
                  {isFailed && (
                    <svg
                      className="w-4 h-4 text-error"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  )}
                  {!isCompleted && !isCurrent && !isFailed && (
                    <div className="w-2 h-2 rounded-full bg-foreground-tertiary opacity-50" />
                  )}
                </div>

                {/* Step label */}
                <span
                  className={`text-sm ${
                    isCurrent
                      ? 'font-medium'
                      : isCompleted
                      ? ''
                      : 'opacity-60'
                  }`}
                >
                  {getStepLabel(stepInfo.step)}
                  {isCurrent && !showError && '...'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Error message */}
        {showError && (
          <div className="mt-4 p-3 bg-error/10 border border-error/20 rounded-md">
            <p className="text-sm text-error">{currentError}</p>
          </div>
        )}

        {/* Elapsed time or Retry button */}
        <div className="mt-6 text-center">
          {showError ? (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          ) : (
            <p className="text-xs text-foreground-tertiary">
              Elapsed: {formatTime(elapsedTime)}
            </p>
          )}
        </div>

        {/* Debug info */}
        {!progress && (
          <p className="mt-4 text-xs text-foreground-tertiary opacity-50 text-center">
            (Simulated progress - waiting for server updates)
          </p>
        )}
      </div>
    </div>
  );
}

interface WorkspaceStoppedProps {
  onStart?: () => void;
  isStarting?: boolean;
}

export function WorkspaceStopped({ onStart, isStarting }: WorkspaceStoppedProps) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-background-secondary text-foreground-tertiary gap-4">
      <div className="text-center">
        <h3 className="text-lg font-medium text-foreground-secondary mb-2">
          Workspace Stopped
        </h3>
        <p className="text-sm mb-4">
          Start the container to use this workspace.
        </p>
        <button
          onClick={onStart}
          disabled={isStarting}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isStarting ? 'Starting...' : 'Start Container'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import { useAuth } from './useAuth';
import type {
  StartupProgress,
  StartupStep,
} from '@/lib/types/startup-progress';

export type { StartupProgress, StartupStep };

interface UseStartupProgressOptions {
  /**
   * Workspace ID to track startup progress for
   */
  workspaceId: string;
  /**
   * Callback for progress updates
   */
  onProgress?: (progress: StartupProgress) => void;
}

/**
 * Hook to subscribe to real-time workspace startup progress
 */
export function useStartupProgress(options: UseStartupProgressOptions) {
  const { workspaceId, onProgress } = options;
  const { token } = useAuth();
  const onProgressRef = useRef(onProgress);
  const [progress, setProgress] = useState<StartupProgress | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Keep ref in sync with callback
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const handleStartupProgress = useCallback(
    (update: StartupProgress) => {
      // Filter by workspace ID
      if (update.workspaceId !== workspaceId) {
        return;
      }

      console.log('Startup progress update received:', update);
      setProgress(update);
      onProgressRef.current?.(update);
    },
    [workspaceId]
  );

  const { socket, isConnected } = useSocket({
    token,
    onConnect: () => {
      console.log('Startup progress hook connected');
    },
    onDisconnect: () => {
      console.log('Startup progress hook disconnected');
    },
  });

  // Subscribe to startup progress updates
  useEffect(() => {
    if (!socket) return;

    socket.on('workspace:startup-progress', handleStartupProgress);

    return () => {
      socket.off('workspace:startup-progress', handleStartupProgress);
    };
  }, [socket, handleStartupProgress]);

  // Update elapsed time every second when progress is active
  useEffect(() => {
    if (!progress || progress.error || progress.currentStep === 'ready') {
      return;
    }

    const startTime = progress.startedAt;
    const updateElapsed = () => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    };

    // Initial update
    updateElapsed();

    // Update every second
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [progress]);

  // Clear progress when component unmounts or workspace changes
  useEffect(() => {
    return () => {
      setProgress(null);
      setElapsedTime(0);
    };
  }, [workspaceId]);

  return {
    progress,
    elapsedTime,
    isConnected,
    isStarting: progress !== null && !progress.error && progress.currentStep !== 'ready',
    hasError: progress?.error !== undefined,
    isReady: progress?.currentStep === 'ready',
  };
}

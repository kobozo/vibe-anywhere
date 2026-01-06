'use client';

import { forwardRef, useImperativeHandle } from 'react';
import { useVoiceRecording, VoiceRecordingState } from '@/hooks/useVoiceRecording';

interface VoiceButtonProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}

export interface VoiceButtonRef {
  toggle: () => Promise<string | null>;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export const VoiceButton = forwardRef<VoiceButtonRef, VoiceButtonProps>(
  function VoiceButton({ onTranscription, disabled, disabledReason }, ref) {
    const {
      state,
      error,
      recordingDuration,
      isSupported,
      unsupportedReason,
      toggle,
    } = useVoiceRecording();

    useImperativeHandle(ref, () => ({
      toggle: async () => {
        const result = await toggle();
        if (result) {
          onTranscription(result);
        }
        return result;
      },
    }), [toggle, onTranscription]);

    const handleClick = async () => {
      if (disabled || !isSupported) return;

      const result = await toggle();
      if (result) {
        onTranscription(result);
      }
    };

    const isDisabled = disabled || !isSupported || state === 'transcribing';
    const showError = state === 'error' && error;

    const getButtonStyles = (): string => {
      const baseStyles = 'flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-all';

      // Check transcribing first before the isDisabled check narrows the type
      if (state === 'transcribing') {
        return `${baseStyles} text-blue-400 bg-blue-900/30 cursor-wait`;
      }

      if (isDisabled) {
        return `${baseStyles} text-gray-600 cursor-not-allowed`;
      }

      if (state === 'recording') {
        return `${baseStyles} text-red-400 bg-red-900/30 hover:bg-red-900/50`;
      }

      if (state === 'error') {
        return `${baseStyles} text-red-400 hover:text-red-300`;
      }

      return `${baseStyles} text-gray-400 hover:text-gray-200 hover:bg-gray-700/50`;
    };

    const getTooltip = (): string => {
      if (!isSupported) {
        return unsupportedReason || 'Voice recording not supported in this browser';
      }
      if (disabled && disabledReason) {
        return disabledReason;
      }
      if (showError) {
        return error;
      }
      if (state === 'recording') {
        return 'Click to stop recording (Ctrl+M)';
      }
      if (state === 'transcribing') {
        return 'Transcribing...';
      }
      return 'Start voice recording (Ctrl+M)';
    };

    return (
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className={getButtonStyles()}
        title={getTooltip()}
      >
        {state === 'transcribing' ? (
          <>
            <span className="animate-spin text-xs">...</span>
          </>
        ) : (
          <>
            <MicrophoneIcon
              className={`w-4 h-4 ${state === 'recording' ? 'animate-pulse' : ''}`}
            />
            {state === 'recording' && (
              <span className="text-xs font-mono">{formatDuration(recordingDuration)}</span>
            )}
          </>
        )}
      </button>
    );
  }
);

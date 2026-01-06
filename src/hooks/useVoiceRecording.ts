'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';

export type VoiceRecordingState = 'idle' | 'recording' | 'transcribing' | 'error';

export interface UseVoiceRecordingReturn {
  state: VoiceRecordingState;
  error: string | null;
  recordingDuration: number;
  isSupported: boolean;
  unsupportedReason: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>;
  cancelRecording: () => void;
  toggle: () => Promise<string | null>;
}

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const { token } = useAuth();
  const [state, setState] = useState<VoiceRecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isSupported, setIsSupported] = useState(true);
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Check browser support
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // Check for secure context (HTTPS or localhost)
    if (!window.isSecureContext) {
      setIsSupported(false);
      setUnsupportedReason('Voice recording requires HTTPS');
      return;
    }

    // Check for MediaRecorder API
    if (typeof MediaRecorder === 'undefined') {
      setIsSupported(false);
      setUnsupportedReason('MediaRecorder API not available');
      return;
    }

    // Check for getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsSupported(false);
      setUnsupportedReason('getUserMedia not available');
      return;
    }

    setIsSupported(true);
    setUnsupportedReason(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setError('Voice recording is not supported in this browser');
      setState('error');
      return;
    }

    setError(null);
    audioChunksRef.current = [];
    setRecordingDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms

      setState('recording');

      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Microphone access denied. Please allow microphone access in your browser settings.');
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone.');
        } else {
          setError(`Recording error: ${err.message}`);
        }
      } else {
        setError('Failed to start recording');
      }

      setState('error');
    }
  }, [isSupported]);

  const stopRecording = useCallback(async (): Promise<string> => {
    if (!mediaRecorderRef.current || state !== 'recording') {
      throw new Error('Not recording');
    }

    // Stop the timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        setState('transcribing');

        try {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mediaRecorder.mimeType,
          });

          // Send to transcription API
          const formData = new FormData();
          formData.append('audio', audioBlob, `recording.${mediaRecorder.mimeType.includes('webm') ? 'webm' : 'mp4'}`);

          const response = await fetch('/api/whisper/transcribe', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          });

          if (!response.ok) {
            const { error } = await response.json();
            throw new Error(error?.message || 'Transcription failed');
          }

          const { data } = await response.json();
          const transcription = data.transcription || '';

          setState('idle');
          setRecordingDuration(0);
          resolve(transcription);
        } catch (err) {
          console.error('Transcription error:', err);
          setError(err instanceof Error ? err.message : 'Transcription failed');
          setState('error');
          reject(err);
        }
      };

      mediaRecorder.stop();
    });
  }, [state, token]);

  const cancelRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    audioChunksRef.current = [];
    setRecordingDuration(0);
    setState('idle');
    setError(null);
  }, [state]);

  const toggle = useCallback(async (): Promise<string | null> => {
    if (state === 'recording') {
      try {
        return await stopRecording();
      } catch {
        return null;
      }
    } else if (state === 'idle' || state === 'error') {
      await startRecording();
      return null;
    }
    return null;
  }, [state, startRecording, stopRecording]);

  return {
    state,
    error,
    recordingDuration,
    isSupported,
    unsupportedReason,
    startRecording,
    stopRecording,
    cancelRecording,
    toggle,
  };
}

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from './useSocket';
import { useAuth } from './useAuth';

interface UseStagingTerminalOptions {
  templateId: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onOutput?: (data: string) => void;
  onEnd?: (message: string) => void;
}

interface UseStagingTerminalReturn {
  isConnected: boolean;
  isAttached: boolean;
  error: Error | null;
  sendInput: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  attach: () => void;
}

export function useStagingTerminal(options: UseStagingTerminalOptions): UseStagingTerminalReturn {
  const { templateId, onConnect, onDisconnect, onOutput, onEnd } = options;
  const { token } = useAuth();
  const [isAttached, setIsAttached] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const attachedRef = useRef(false);

  // Store callbacks in refs to avoid re-creating socket on callback changes
  const onOutputRef = useRef(onOutput);
  const onEndRef = useRef(onEnd);

  useEffect(() => {
    onOutputRef.current = onOutput;
    onEndRef.current = onEnd;
  }, [onOutput, onEnd]);

  const { socket, isConnected } = useSocket({
    token,
    onConnect: () => {
      console.log('[StagingTerminal] Socket connected callback fired');
      onConnect?.();
    },
    onDisconnect: () => {
      console.log('[StagingTerminal] Socket disconnected callback fired');
      onDisconnect?.();
    },
    onError: (err) => {
      console.log('[StagingTerminal] Socket error callback fired', err);
      setError(err);
    },
  });

  // Debug: log socket state changes
  console.log('[StagingTerminal] Socket state:', { hasSocket: !!socket, isConnected, socketConnected: socket?.connected });

  // Attach to staging terminal when connected
  const attach = useCallback(() => {
    console.log('[StagingTerminal] attach called', {
      hasSocket: !!socket,
      isConnected,
      templateId,
      alreadyAttached: attachedRef.current
    });
    if (socket && isConnected && templateId && !attachedRef.current) {
      console.log('[StagingTerminal] Emitting staging:attach', { templateId });
      socket.emit('staging:attach', { templateId });
      attachedRef.current = true;
    }
  }, [socket, isConnected, templateId]);

  // Set up event listeners
  useEffect(() => {
    if (!socket) {
      console.log('[StagingTerminal] No socket available for event listeners');
      return;
    }

    console.log('[StagingTerminal] Setting up event listeners');

    const handleAttached = (data: { templateId: string }) => {
      console.log('[StagingTerminal] Received staging:attached', data);
      if (data.templateId === templateId) {
        setIsAttached(true);
        setError(null);
      }
    };

    const handleOutput = (data: { data: string }) => {
      console.log('[StagingTerminal] Received terminal:output', { length: data.data.length });
      onOutputRef.current?.(data.data);
    };

    const handleEnd = (data: { message: string }) => {
      console.log('[StagingTerminal] Received terminal:end', data);
      setIsAttached(false);
      attachedRef.current = false;
      onEndRef.current?.(data.message);
    };

    const handleError = (data: { message: string }) => {
      console.log('[StagingTerminal] Received error', data);
      setError(new Error(data.message));
    };

    socket.on('staging:attached', handleAttached);
    socket.on('terminal:output', handleOutput);
    socket.on('terminal:end', handleEnd);
    socket.on('error', handleError);

    return () => {
      socket.off('staging:attached', handleAttached);
      socket.off('terminal:output', handleOutput);
      socket.off('terminal:end', handleEnd);
      socket.off('error', handleError);
    };
  }, [socket, templateId]);

  // Reset attached state when template changes
  useEffect(() => {
    setIsAttached(false);
    attachedRef.current = false;
  }, [templateId]);

  const sendInput = useCallback(
    (data: string) => {
      if (socket && isAttached) {
        socket.emit('terminal:input', { data });
      }
    },
    [socket, isAttached]
  );

  const resize = useCallback(
    (cols: number, rows: number) => {
      if (socket && isAttached) {
        socket.emit('terminal:resize', { cols, rows });
      }
    },
    [socket, isAttached]
  );

  return {
    isConnected,
    isAttached,
    error,
    sendInput,
    resize,
    attach,
  };
}

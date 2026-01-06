'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseSocketOptions {
  token: string | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  error: Error | null;
}

// Global socket instance to persist across React StrictMode double-invocation
let globalSocket: Socket | null = null;
let globalSocketToken: string | null = null;

export function useSocket(options: UseSocketOptions): UseSocketReturn {
  const { token, onConnect, onDisconnect, onError } = options;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  // Use refs for callbacks to avoid recreating socket on callback changes
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  // Keep refs in sync with latest callbacks
  useEffect(() => {
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  }, [onConnect, onDisconnect, onError]);

  useEffect(() => {
    mountedRef.current = true;

    if (!token) {
      return;
    }

    // Reuse existing socket if token matches (even if still connecting)
    if (globalSocket && globalSocketToken === token) {
      console.log('[useSocket] Reusing global socket', {
        connected: globalSocket.connected,
        id: globalSocket.id
      });
      setSocket(globalSocket);

      // Set initial connected state based on actual socket state
      if (globalSocket.connected) {
        console.log('[useSocket] Global socket already connected, setting isConnected=true');
        setIsConnected(true);
      }

      // Still need to listen for future connect/disconnect events on the reused socket
      const handleConnect = () => {
        if (mountedRef.current) {
          console.log('[useSocket] Reused socket - connect event');
          setIsConnected(true);
          setError(null);
          onConnectRef.current?.();
        }
      };

      const handleDisconnect = (reason: string) => {
        if (mountedRef.current) {
          console.log('[useSocket] Reused socket - disconnect event:', reason);
          setIsConnected(false);
          onDisconnectRef.current?.();
        }
      };

      globalSocket.on('connect', handleConnect);
      globalSocket.on('disconnect', handleDisconnect);

      return () => {
        globalSocket.off('connect', handleConnect);
        globalSocket.off('disconnect', handleDisconnect);
      };
    }

    // Disconnect existing socket if token changed
    if (globalSocket && globalSocketToken !== token) {
      globalSocket.disconnect();
      globalSocket = null;
      globalSocketToken = null;
    }

    // Create socket connection
    const newSocket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    globalSocket = newSocket;
    globalSocketToken = token;

    newSocket.on('connect', () => {
      if (mountedRef.current) {
        console.log('Socket connected');
        // Don't call setSocket here - it's already set at line 112
        // Calling it again causes unnecessary re-renders and effect re-runs
        setIsConnected(true);
        setError(null);
        onConnectRef.current?.();
      }
    });

    newSocket.on('disconnect', (reason) => {
      if (mountedRef.current) {
        console.log('Socket disconnected:', reason);
        setIsConnected(false);
        onDisconnectRef.current?.();
      }
    });

    newSocket.on('connect_error', (err) => {
      if (mountedRef.current) {
        console.error('Socket connection error:', err);
        setError(err);
        onErrorRef.current?.(err);
      }
    });

    newSocket.on('error', (data: { message: string }) => {
      if (mountedRef.current) {
        const err = new Error(data.message);
        setError(err);
        onErrorRef.current?.(err);
      }
    });

    setSocket(newSocket);

    return () => {
      mountedRef.current = false;
      // Don't disconnect the global socket on unmount - keep it alive
      // It will be disconnected when token changes or page unloads
    };
  }, [token]);

  // Cleanup on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (globalSocket) {
        globalSocket.disconnect();
        globalSocket = null;
        globalSocketToken = null;
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  return {
    socket,
    isConnected,
    error,
  };
}

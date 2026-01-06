'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/lib/theme';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  tabId: string;
  onConnectionChange?: (connected: boolean) => void;
  onEnd?: () => void;
}

export function Terminal({ tabId, onConnectionChange, onEnd }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isAttached, setIsAttached] = useState(false);
  const attachedTabIdRef = useRef<string | null>(null);
  const { token } = useAuth();
  const { theme } = useTheme();

  const handleConnect = useCallback(() => {
    onConnectionChange?.(true);
  }, [onConnectionChange]);

  const handleDisconnect = useCallback(() => {
    onConnectionChange?.(false);
  }, [onConnectionChange]);

  const { socket, isConnected, error } = useSocket({
    token,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
  });

  // Safe fit function that checks dimensions first
  const safeFit = useCallback((fitAddon: FitAddon, container: HTMLElement) => {
    // Only fit if container has actual dimensions
    if (container.offsetWidth > 0 && container.offsetHeight > 0) {
      try {
        fitAddon.fit();
      } catch {
        // Ignore fit errors during initialization
      }
    }
  }, []);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const container = terminalRef.current;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      theme: theme.terminal,
      allowTransparency: false,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Open terminal immediately - xterm handles buffering if container isn't ready
    xterm.open(container);

    // Fit after a short delay to ensure container has dimensions
    const fitTimeout = setTimeout(() => {
      safeFit(fitAddon, container);
    }, 50);

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      safeFit(fitAddon, container);
    });
    resizeObserver.observe(container);

    return () => {
      clearTimeout(fitTimeout);
      resizeObserver.disconnect();
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  // Note: We don't include theme in deps to avoid recreating terminal on theme change
  // Theme updates are handled separately below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeFit]);

  // Update terminal theme when app theme changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = theme.terminal;
    }
  }, [theme]);

  // Handle socket events
  useEffect(() => {
    if (!socket) return;

    console.log('Setting up socket event listeners for socket:', socket.id);

    // Handle terminal output (filter by tabId)
    const handleOutput = (data: { tabId?: string; data: string }) => {
      // Only process output for this specific tab
      if (data.tabId && data.tabId !== tabId) {
        return;
      }
      if (xtermRef.current) {
        xtermRef.current.write(data.data);
      }
    };

    // Handle buffered output on reconnect
    const handleBuffer = (data: { lines: string[] }) => {
      if (xtermRef.current) {
        // Clear terminal before writing buffer
        xtermRef.current.clear();
        // Write each line with proper line endings
        data.lines.forEach((line, index) => {
          xtermRef.current!.write(line);
          // Add newline after each line except the last (which is current line)
          if (index < data.lines.length - 1) {
            xtermRef.current!.write('\r\n');
          }
        });
      }
    };

    // Handle tab attached
    const handleAttached = (data: { tabId: string; reconnected?: boolean }) => {
      console.log('Received tab:attached for tabId:', data.tabId, 'reconnected:', data.reconnected);
      attachedTabIdRef.current = data.tabId;
      setIsAttached(true);
      if (xtermRef.current) {
        // Send initial terminal size to server
        const { cols, rows } = xtermRef.current;
        console.log('Sending initial terminal size:', cols, 'x', rows);
        socket.emit('terminal:resize', { cols, rows });

        // Focus the terminal
        xtermRef.current.focus();

        // Re-fit after a short delay to ensure correct dimensions
        if (fitAddonRef.current && terminalRef.current) {
          setTimeout(() => {
            if (fitAddonRef.current && terminalRef.current) {
              try {
                fitAddonRef.current.fit();
                // Send updated size after fit
                if (xtermRef.current) {
                  socket.emit('terminal:resize', {
                    cols: xtermRef.current.cols,
                    rows: xtermRef.current.rows
                  });
                }
              } catch (e) {
                // Ignore fit errors
              }
            }
          }, 100);
        }
      }
    };

    // Handle tab end
    const handleEnd = () => {
      if (xtermRef.current) {
        xtermRef.current.writeln('\r\n\x1b[33m[Session ended]\x1b[0m');
      }
      onEnd?.();
    };

    // Handle errors from server
    const handleError = (data: { message: string }) => {
      console.error('Socket error:', data.message);
      if (xtermRef.current) {
        xtermRef.current.writeln(`\r\n\x1b[31m[Error: ${data.message}]\x1b[0m`);
      }
    };

    socket.on('terminal:output', handleOutput);
    socket.on('terminal:buffer', handleBuffer);
    socket.on('tab:attached', handleAttached);
    socket.on('terminal:end', handleEnd);
    socket.on('error', handleError);

    return () => {
      socket.off('terminal:output', handleOutput);
      socket.off('terminal:buffer', handleBuffer);
      socket.off('tab:attached', handleAttached);
      socket.off('terminal:end', handleEnd);
      socket.off('error', handleError);
    };
  }, [socket, tabId, onEnd]);

  // Handle terminal input and resize (requires xterm to be ready)
  useEffect(() => {
    if (!socket || !xtermRef.current) return;

    const xterm = xtermRef.current;

    // Handle user input
    const inputDisposable = xterm.onData((data) => {
      socket.emit('terminal:input', { data });
    });

    // Handle resize
    const resizeDisposable = xterm.onResize(({ cols, rows }) => {
      socket.emit('terminal:resize', { cols, rows });
    });

    return () => {
      inputDisposable.dispose();
      resizeDisposable.dispose();
    };
  }, [socket]);

  // Handle clipboard paste events (for image pasting)
  // Uploads image to container and uses tmux native paste-buffer
  useEffect(() => {
    if (!socket || !terminalRef.current) return;

    const container = terminalRef.current;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      // Check for image in clipboard
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();
          if (!file) continue;

          try {
            // Read file as base64
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                // Remove data URL prefix (e.g., "data:image/png;base64,")
                const base64Data = result.split(',')[1];
                resolve(base64Data);
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });

            const requestId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            const filename = file.name || `clipboard-image.${item.type.split('/')[1]}`;

            // Send to server - agent will save file and use tmux native paste
            socket.emit('file:upload', {
              requestId,
              filename,
              data: base64,
              mimeType: item.type,
            });

          } catch (error) {
            console.error('Image paste error:', error);
            if (xtermRef.current) {
              xtermRef.current.write(`\r\n\x1b[31m[Paste error: ${error instanceof Error ? error.message : 'Unknown error'}]\x1b[0m\r\n`);
            }
          }

          return; // Only handle first image
        }
      }
    };

    container.addEventListener('paste', handlePaste);

    return () => {
      container.removeEventListener('paste', handlePaste);
    };
  }, [socket]);

  // Attach to tab when connected
  useEffect(() => {
    // Only attach if not already attached to this specific tab
    const needsAttach = isConnected && socket &&
                        (!isAttached || attachedTabIdRef.current !== tabId);

    if (needsAttach) {
      console.log('Emitting tab:attach for tabId:', tabId, 'socketId:', socket.id);

      // Clear terminal when switching to a different tab
      if (xtermRef.current && attachedTabIdRef.current && attachedTabIdRef.current !== tabId) {
        xtermRef.current.clear();
      }

      socket.emit('tab:attach', { tabId });
    }
  }, [isConnected, socket, tabId, isAttached]);

  // Display connection errors only
  useEffect(() => {
    if (!xtermRef.current) return;

    if (error) {
      xtermRef.current.writeln(`\r\n\x1b[31m[Error: ${error.message}]\x1b[0m`);
    }
  }, [error]);

  return (
    <div
      className="h-full w-full min-h-0 rounded-lg overflow-hidden flex flex-col"
      style={{ backgroundColor: theme.terminal.background }}
    >
      <div ref={terminalRef} className="flex-1 min-h-0" />
    </div>
  );
}

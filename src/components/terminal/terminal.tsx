'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ImageAddon } from '@xterm/addon-image';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/lib/theme';
import { StatusBar } from './status-bar';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  tabId: string;
  workspaceId?: string;
  onConnectionChange?: (connected: boolean) => void;
  onEnd?: () => void;
  onContextMenu?: (event: { x: number; y: number; tabId: string }) => void;
}

export function Terminal({ tabId, workspaceId, onConnectionChange, onEnd, onContextMenu }: TerminalProps) {
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
    const imageAddon = new ImageAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.loadAddon(imageAddon);

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

    // Handle file upload response
    const handleFileUploaded = (data: { requestId: string; success: boolean; filePath?: string; error?: string }) => {
      if (xtermRef.current) {
        if (data.success) {
          xtermRef.current.write(`\r\n\x1b[32m[Image: ${data.filePath}]\x1b[0m\r\n`);
        } else {
          xtermRef.current.write(`\r\n\x1b[31m[Upload failed: ${data.error}]\x1b[0m\r\n`);
        }
      }
    };

    socket.on('terminal:output', handleOutput);
    socket.on('terminal:buffer', handleBuffer);
    socket.on('tab:attached', handleAttached);
    socket.on('terminal:end', handleEnd);
    socket.on('error', handleError);
    socket.on('file:uploaded', handleFileUploaded);

    return () => {
      socket.off('terminal:output', handleOutput);
      socket.off('terminal:buffer', handleBuffer);
      socket.off('tab:attached', handleAttached);
      socket.off('terminal:end', handleEnd);
      socket.off('error', handleError);
      socket.off('file:uploaded', handleFileUploaded);
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

  // Handle Ctrl+V paste with image support
  // Uses xterm's attachCustomKeyEventHandler to intercept BEFORE xterm sends to PTY
  useEffect(() => {
    if (!socket || !xtermRef.current) return;

    const xterm = xtermRef.current;

    // Helper function to upload image
    const handleImageUpload = async (blob: Blob, mimeType: string) => {
      try {
        // Convert blob to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64Data = result.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        const requestId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const filename = `clipboard-image.${mimeType.split('/')[1]}`;

        // Show uploading feedback
        xterm.write('\r\n\x1b[33m[Uploading image...]\x1b[0m');

        // Send to server
        socket.emit('file:upload', {
          requestId,
          filename,
          data: base64,
          mimeType,
        });
      } catch (error) {
        console.error('Image paste error:', error);
        xterm.write(`\r\n\x1b[31m[Paste error: ${error instanceof Error ? error.message : 'Unknown error'}]\x1b[0m\r\n`);
      }
    };

    // Intercept Ctrl+V before xterm handles it
    const keyEventHandler = (event: KeyboardEvent): boolean => {
      // Check for Ctrl+V (or Cmd+V on Mac)
      if (event.type === 'keydown' && (event.ctrlKey || event.metaKey) && event.key === 'v') {
        // Check if Clipboard API is available (requires HTTPS or localhost)
        if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
          // Read clipboard and check for images
          navigator.clipboard.read().then(async (items) => {
            for (const item of items) {
              const imageType = item.types.find(t => t.startsWith('image/'));
              if (imageType) {
                const blob = await item.getType(imageType);
                handleImageUpload(blob, imageType);
                return; // Image found and handled
              }
            }
            // No image found - do normal text paste
            navigator.clipboard.readText().then(text => {
              if (text) {
                xterm.paste(text);
              }
            }).catch(() => {});
          }).catch(() => {
            // Fallback: try text paste on clipboard read error
            navigator.clipboard.readText().then(text => {
              if (text) {
                xterm.paste(text);
              }
            }).catch(() => {});
          });
          return false; // Prevent xterm from handling Ctrl+V
        }
        // Clipboard API not available (HTTP non-localhost) - let xterm handle it
        // and rely on paste event fallback
        return true;
      }
      return true; // Let xterm handle other keys
    };

    xterm.attachCustomKeyEventHandler(keyEventHandler);

    // Fallback paste event listener for HTTP non-localhost
    // (where navigator.clipboard.read() is not available)
    const handlePasteEvent = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          e.stopPropagation();
          const blob = item.getAsFile();
          if (blob) {
            handleImageUpload(blob, item.type);
          }
          return;
        }
      }
    };

    // Add paste listener to terminal container for fallback
    const container = xterm.element;
    if (container) {
      container.addEventListener('paste', handlePasteEvent);
    }

    return () => {
      // Reset key handler on cleanup
      xterm.attachCustomKeyEventHandler(() => true);
      if (container) {
        container.removeEventListener('paste', handlePasteEvent);
      }
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

  // Handle right-click context menu
  useEffect(() => {
    const container = terminalRef.current;
    if (!container || !onContextMenu) return;

    const handleRightClick = (e: MouseEvent) => {
      // Skip if text is selected (allow browser copy menu)
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        return;
      }

      e.preventDefault();
      onContextMenu({
        x: e.clientX,
        y: e.clientY,
        tabId,
      });
    };

    container.addEventListener('contextmenu', handleRightClick);
    return () => container.removeEventListener('contextmenu', handleRightClick);
  }, [onContextMenu, tabId]);

  return (
    <div
      className="h-full w-full min-h-0 overflow-hidden flex flex-col"
      style={{ backgroundColor: theme.terminal.background }}
    >
      <div ref={terminalRef} className="flex-1 min-h-0" />
      {workspaceId && (
        <StatusBar
          workspaceId={workspaceId}
          tabId={tabId}
          socket={socket}
          isConnected={isConnected}
        />
      )}
    </div>
  );
}

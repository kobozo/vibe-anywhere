'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useStagingTerminal } from '@/hooks/useStagingTerminal';
import type { ProxmoxTemplate } from '@/lib/db/schema';
import '@xterm/xterm/css/xterm.css';

interface StagingTerminalModalProps {
  isOpen: boolean;
  template: ProxmoxTemplate | null;
  onClose: () => void;
  onFinalize: () => Promise<void>;
  isFinalizing?: boolean;
}

export function StagingTerminalModal({
  isOpen,
  template,
  onClose,
  onFinalize,
  isFinalizing = false,
}: StagingTerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [localFinalizing, setLocalFinalizing] = useState(false);

  // Debug: log template state
  console.log('[StagingTerminalModal] Render:', {
    isOpen,
    templateId: template?.id,
    templateName: template?.name,
    templateStatus: template?.status,
    stagingContainerIp: template?.stagingContainerIp,
  });

  const handleOutput = useCallback((data: string) => {
    if (xtermRef.current) {
      xtermRef.current.write(data);
    }
  }, []);

  const handleEnd = useCallback((message: string) => {
    if (xtermRef.current) {
      xtermRef.current.write(`\r\n\x1b[33m${message}\x1b[0m\r\n`);
    }
  }, []);

  const { isConnected, isAttached, error, sendInput, resize, attach } = useStagingTerminal({
    templateId: template?.id || '',
    onOutput: handleOutput,
    onEnd: handleEnd,
  });

  // Safe fit function
  const safeFit = useCallback((fitAddon: FitAddon, container: HTMLElement) => {
    if (container.offsetWidth > 0 && container.offsetHeight > 0) {
      try {
        fitAddon.fit();
      } catch {
        // Ignore fit errors
      }
    }
  }, []);

  // Initialize terminal
  useEffect(() => {
    if (!isOpen || !terminalRef.current) return;

    const container = terminalRef.current;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#aeafad',
        cursorAccent: '#000000',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#dcdcaa',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#dcdcaa',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#ffffff',
      },
      allowTransparency: false,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    xterm.open(container);

    // Fit after short delay
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
  }, [isOpen, safeFit]);

  // Attach to staging terminal when connected
  useEffect(() => {
    console.log('[StagingTerminalModal] Attach effect check:', {
      isOpen,
      isConnected,
      templateId: template?.id,
      templateStatus: template?.status,
      stagingContainerIp: template?.stagingContainerIp,
      isAttached
    });
    if (isOpen && isConnected && template?.id && !isAttached) {
      console.log('[StagingTerminalModal] Calling attach()');
      attach();
    }
  }, [isOpen, isConnected, template?.id, isAttached, attach]);

  // Extra debug: watch for isConnected changes
  useEffect(() => {
    console.log('[StagingTerminalModal] isConnected changed to:', isConnected);
  }, [isConnected]);

  // Handle terminal input
  useEffect(() => {
    if (!xtermRef.current || !isAttached) return;

    const inputDisposable = xtermRef.current.onData(sendInput);

    return () => {
      inputDisposable.dispose();
    };
  }, [isAttached, sendInput]);

  // Handle terminal resize
  useEffect(() => {
    if (!xtermRef.current || !isAttached) return;

    const resizeDisposable = xtermRef.current.onResize(({ cols, rows }) => {
      resize(cols, rows);
    });

    return () => {
      resizeDisposable.dispose();
    };
  }, [isAttached, resize]);

  // Initial resize after attach
  useEffect(() => {
    if (isAttached && xtermRef.current && fitAddonRef.current) {
      const dims = fitAddonRef.current.proposeDimensions();
      if (dims) {
        resize(dims.cols, dims.rows);
      }
    }
  }, [isAttached, resize]);

  const handleFinalize = async () => {
    setLocalFinalizing(true);
    try {
      await onFinalize();
    } finally {
      setLocalFinalizing(false);
    }
  };

  if (!isOpen || !template) return null;

  const finalizing = isFinalizing || localFinalizing;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg w-[90vw] h-[85vh] flex flex-col max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Staging: {template.name}
            </h2>
            <p className="text-sm text-foreground-secondary">
              {template.stagingContainerIp ? (
                <>Connected to {template.stagingContainerIp} (VMID: {template.vmid})</>
              ) : (
                <>VMID: {template.vmid}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isAttached ? 'bg-success' : isConnected ? 'bg-warning' : 'bg-error'
                }`}
              />
              <span className="text-sm text-foreground-secondary">
                {isAttached ? 'Connected' : isConnected ? 'Connecting...' : 'Disconnected'}
              </span>
            </div>
            {error && (
              <span className="text-sm text-error" title={error.message}>
                Error
              </span>
            )}
          </div>
        </div>

        {/* Terminal */}
        <div className="flex-1 min-h-0 p-2 bg-[#1e1e1e]">
          <div ref={terminalRef} className="h-full w-full" />
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-border">
          <div className="text-sm text-foreground-secondary max-w-xl">
            Make your customizations in the terminal above. When finished, click
            &quot;Finalize Template&quot; to stop the container and convert it to a template.
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-foreground-secondary hover:text-foreground transition-colors"
              disabled={finalizing}
            >
              Cancel (Keep Running)
            </button>
            <button
              onClick={handleFinalize}
              className="px-4 py-2 bg-success hover:bg-success/80 text-foreground rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={finalizing}
            >
              {finalizing ? 'Finalizing...' : 'Finalize Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

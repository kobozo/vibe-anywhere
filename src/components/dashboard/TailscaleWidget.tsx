'use client';

import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { Settings, Download, X, Copy, Check } from 'lucide-react';

interface TailscalePeer {
  id: string;
  hostname: string;
  tailscaleIP: string;
  online: boolean;
}

interface TailscaleStatus {
  online: boolean;
  tailscaleIP: string | null;
  hostname: string | null;
  tailnet: string | null;
  peerCount: number;
  version: string | null;
  exitNode: string | null;
  peers?: TailscalePeer[];
}

interface ChromeStatus {
  connected: boolean;
  chromeHost: string | null;
  socketProxyRunning?: boolean;
  lastActivity: string;
}

interface TailscaleWidgetProps {
  workspaceId: string;
  tailscaleStatus: TailscaleStatus | null;
  chromeStatus: ChromeStatus | null;
  isAgentConnected: boolean;
  isTailscaleConfigured: boolean;
  chromeTailscaleHost: string | null;
}

export function TailscaleWidget({
  workspaceId,
  tailscaleStatus,
  chromeStatus,
  isAgentConnected,
  isTailscaleConfigured,
  chromeTailscaleHost,
}: TailscaleWidgetProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedChromeHost, setSelectedChromeHost] = useState<string | null>(chromeTailscaleHost);
  const [showSettings, setShowSettings] = useState(false);
  const [showScriptContent, setShowScriptContent] = useState(false);
  const [scriptContent, setScriptContent] = useState<string>('');
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [copied, setCopied] = useState(false);
  const { token } = useAuth();
  const { socket, isConnected: isSocketConnected } = useSocket({ token });

  // Cache the last known good status to avoid flickering between connected/unknown
  const lastKnownStatusRef = useRef<TailscaleStatus | null>(null);

  // Update local state when prop changes
  useEffect(() => {
    setSelectedChromeHost(chromeTailscaleHost);
  }, [chromeTailscaleHost]);

  // Update cache when we receive a valid status
  useEffect(() => {
    if (tailscaleStatus !== null && tailscaleStatus !== undefined) {
      lastKnownStatusRef.current = tailscaleStatus;
    }
  }, [tailscaleStatus]);

  // Use cached status when current status is unknown/null
  const effectiveStatus = tailscaleStatus ?? lastKnownStatusRef.current;

  const handleConnect = async () => {
    if (!isTailscaleConfigured) {
      setError('Tailscale not configured. Please add OAuth token in Settings.');
      return;
    }

    if (!socket || !isSocketConnected) {
      setError('WebSocket not connected. Please refresh the page.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Send connect request to server via WebSocket
      // Auth key generation happens server-side
      const requestId = uuidv4();

      const result = await new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 30000);

        socket.once(`tailscale:connect:response`, (response: { requestId: string; success: boolean; error?: string }) => {
          if (response.requestId === requestId) {
            clearTimeout(timeout);
            resolve({ success: response.success, error: response.error });
          }
        });

        socket.emit('tailscale:connect', { requestId, workspaceId });
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to connect');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Tailscale');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!socket || !isSocketConnected) {
      setError('WebSocket not connected. Please refresh the page.');
      return;
    }

    setIsDisconnecting(true);
    setError(null);

    try {
      const requestId = uuidv4();

      const result = await new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Disconnection timeout'));
        }, 30000);

        socket.once(`tailscale:disconnect:response`, (response: { requestId: string; success: boolean; error?: string }) => {
          if (response.requestId === requestId) {
            clearTimeout(timeout);
            resolve({ success: response.success, error: response.error });
          }
        });

        socket.emit('tailscale:disconnect', { requestId, workspaceId });
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to disconnect');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect from Tailscale');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!socket || !isSocketConnected) {
      return;
    }

    // Trigger a refresh by requesting status from agent
    try {
      const requestId = uuidv4();
      socket.emit('tailscale:status', { requestId, workspaceId });
    } catch (err) {
      console.error('Failed to refresh status:', err);
    }
  };

  const handleChromeHostChange = async (chromeHost: string | null) => {
    try {
      // Update local state immediately for responsive UI
      setSelectedChromeHost(chromeHost);

      const response = await fetch(`/api/workspaces/${workspaceId}/chrome-host`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ chromeHost }),
      });

      if (!response.ok) {
        // Revert on error
        setSelectedChromeHost(chromeTailscaleHost);
        throw new Error('Failed to update Chrome host');
      }

      console.log('[Chrome Host] Updated to:', chromeHost || 'local');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Chrome host');
    }
  };

  const handleViewScript = async () => {
    if (scriptContent) {
      // Already loaded, just show it
      setShowScriptContent(true);
      return;
    }

    setIsLoadingScript(true);
    try {
      const response = await fetch('/api/chrome-bridge/download');
      if (!response.ok) {
        throw new Error('Failed to load script');
      }
      const content = await response.text();
      setScriptContent(content);
      setShowScriptContent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load script');
    } finally {
      setIsLoadingScript(false);
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(scriptContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  const handleDownloadScript = () => {
    // Create blob and download
    const blob = new Blob([scriptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chrome-bridge.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Determine overall status
  let statusColor = 'bg-foreground-tertiary';
  let statusText = 'Unknown';
  let statusTitle = 'Tailscale status unknown';

  if (!isTailscaleConfigured) {
    statusColor = 'bg-warning';
    statusText = 'Not Configured';
    statusTitle = 'Tailscale OAuth token not configured in Settings';
  } else if (!isAgentConnected) {
    statusColor = 'bg-foreground-tertiary';
    statusText = 'Agent Offline';
    statusTitle = 'Agent is not connected';
  } else if (effectiveStatus?.online) {
    statusColor = 'bg-success';
    statusText = 'Connected';
    statusTitle = 'Connected to Tailscale network';
  } else if (effectiveStatus === null) {
    statusColor = 'bg-foreground-tertiary';
    statusText = 'Unknown';
    statusTitle = 'Tailscale status unknown - may not be installed';
  } else {
    statusColor = 'bg-error';
    statusText = 'Disconnected';
    statusTitle = 'Tailscale is disconnected';
  }

  return (
    <div className="bg-background-secondary border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Tailscale Network</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 text-foreground-secondary hover:text-foreground hover:bg-background-tertiary rounded"
            title="Chrome Browser Settings"
            disabled={!isAgentConnected || !effectiveStatus?.online}
          >
            <Settings size={16} />
          </button>
          <button
            onClick={handleRefreshStatus}
            className="text-xs text-primary hover:text-primary-hover"
            disabled={!isAgentConnected}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2 mb-4">
        <span className={`w-3 h-3 rounded-full ${statusColor}`} title={statusTitle} />
        <span className="text-foreground font-medium">{statusText}</span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-error/20 border border-error/30 rounded text-sm text-error">
          {error}
        </div>
      )}

      {/* Network Info */}
      {effectiveStatus?.online && (
        <div className="space-y-2 mb-4 text-sm">
          <div className="flex justify-between">
            <span className="text-foreground-secondary">IP Address:</span>
            <span className="text-foreground font-mono">{effectiveStatus.tailscaleIP || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground-secondary">Hostname:</span>
            <span className="text-foreground">{effectiveStatus.hostname || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground-secondary">Tailnet:</span>
            <span className="text-foreground">{effectiveStatus.tailnet || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground-secondary">Peers:</span>
            <span className="text-foreground">{effectiveStatus.peerCount}</span>
          </div>
          {effectiveStatus.exitNode && (
            <div className="flex justify-between">
              <span className="text-foreground-secondary">Exit Node:</span>
              <span className="text-foreground">{effectiveStatus.exitNode}</span>
            </div>
          )}
        </div>
      )}

      {/* Control Buttons */}
      {isTailscaleConfigured && isAgentConnected && (
        <div className="flex gap-2">
          {effectiveStatus?.online ? (
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="flex-1 px-3 py-2 bg-error/20 hover:bg-error/30 disabled:opacity-50 rounded text-sm text-error"
            >
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="flex-1 px-3 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 rounded text-sm text-foreground"
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      )}

      {/* Configuration Notice */}
      {!isTailscaleConfigured && (
        <div className="text-xs text-foreground-secondary mt-3">
          Configure Tailscale in{' '}
          <span className="text-primary cursor-pointer hover:text-primary-hover">
            Settings → Tailscale
          </span>
        </div>
      )}

      {/* Chrome Browser Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
          <div className="bg-background-secondary border border-border rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-foreground">Chrome Browser Settings</h4>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 text-foreground-secondary hover:text-foreground hover:bg-background-tertiary rounded"
              >
                <X size={20} />
              </button>
            </div>

            {/* Chrome Device Selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                Chrome Device
              </label>
              <select
                value={selectedChromeHost || ''}
                onChange={(e) => handleChromeHostChange(e.target.value || null)}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={!isAgentConnected}
              >
                <option value="">None (Local Chrome)</option>
                {effectiveStatus?.peers
                  ?.filter(peer => peer.online)
                  .map(peer => (
                    <option key={peer.id} value={peer.tailscaleIP}>
                      {peer.hostname} ({peer.tailscaleIP})
                    </option>
                  ))}
              </select>
              <p className="text-xs text-foreground-secondary mt-1">
                Select which Tailscale peer has Chrome with Claude extension
              </p>
            </div>

            {/* Chrome Status */}
            {chromeStatus && (
              <div className="mb-4 p-3 bg-background border border-border rounded">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      chromeStatus.socketProxyRunning ? 'bg-success' : 'bg-foreground-tertiary'
                    }`}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {chromeStatus.socketProxyRunning ? 'Socket Proxy Running' : 'Socket Proxy Not Running'}
                  </span>
                </div>
                {chromeStatus.chromeHost && (
                  <p className="text-xs text-foreground-secondary ml-4">
                    Proxying to: {chromeStatus.chromeHost}:19222
                  </p>
                )}
                {chromeStatus.socketProxyRunning && (
                  <p className="text-xs text-success ml-4 mt-1">
                    ✓ Ready for claude --chrome
                  </p>
                )}
                {!chromeStatus.socketProxyRunning && chromeStatus.chromeHost && (
                  <p className="text-xs text-warning ml-4 mt-1">
                    ⚠ Select Chrome device above to start proxy
                  </p>
                )}
              </div>
            )}

            {/* Bridge Script Section */}
            <div className="mb-4 p-4 bg-background border border-border rounded">
              <h5 className="text-sm font-medium text-foreground mb-2">Chrome Bridge Server</h5>
              <p className="text-xs text-foreground-secondary mb-3">
                Copy and save this script on the machine with Chrome to enable remote browser control.
              </p>
              <button
                onClick={handleViewScript}
                disabled={isLoadingScript}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 rounded text-sm text-foreground font-medium"
              >
                <Copy size={16} />
                {isLoadingScript ? 'Loading...' : 'View Script'}
              </button>
              <p className="text-xs text-foreground-secondary mt-2">
                Save as <code className="bg-background-tertiary px-1 rounded">chrome-bridge.js</code> and run with: <code className="bg-background-tertiary px-1 rounded">node chrome-bridge.js</code>
              </p>
            </div>

            {/* Setup Instructions Link */}
            <div className="text-xs text-foreground-secondary">
              <a
                href="https://github.com/kobozo/vibe-anywhere/blob/main/docs/CHROME-PROXY.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary-hover underline"
              >
                View full setup instructions →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Script Content Modal */}
      {showScriptContent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowScriptContent(false)}>
          <div className="bg-background-secondary border border-border rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-foreground">chrome-bridge.js</h4>
              <button
                onClick={() => setShowScriptContent(false)}
                className="p-1 text-foreground-secondary hover:text-foreground hover:bg-background-tertiary rounded"
              >
                <X size={20} />
              </button>
            </div>

            {/* Script Content */}
            <div className="flex-1 overflow-hidden mb-4">
              <textarea
                readOnly
                value={scriptContent}
                className="w-full h-full min-h-[400px] p-3 bg-background border border-border rounded font-mono text-xs text-foreground resize-none focus:outline-none"
                spellCheck={false}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleCopyScript}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover rounded text-sm text-foreground font-medium"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
              <button
                onClick={handleDownloadScript}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-background-tertiary hover:bg-background border border-border rounded text-sm text-foreground font-medium"
              >
                <Download size={16} />
                Download as .js
              </button>
            </div>

            <p className="text-xs text-foreground-secondary mt-3">
              💡 Tip: Copy the script content and paste it into a new file named <code className="bg-background-tertiary px-1 rounded">chrome-bridge.js</code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

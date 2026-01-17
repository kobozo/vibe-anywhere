'use client';

import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';

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
        <button
          onClick={handleRefreshStatus}
          className="text-xs text-primary hover:text-primary-hover"
          disabled={!isAgentConnected}
        >
          Refresh
        </button>
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

      {/* Chrome Browser Control */}
      {effectiveStatus?.online && effectiveStatus.peers && effectiveStatus.peers.length > 0 && (
        <div className="border-t border-border pt-3 mb-4">
          <div className="text-xs text-foreground-secondary mb-2">Chrome Browser Control</div>

          {/* Chrome Host Selector */}
          <div className="mb-3">
            <label className="block text-xs text-foreground-secondary mb-1">
              Chrome Device:
            </label>
            <select
              value={selectedChromeHost || ''}
              onChange={(e) => handleChromeHostChange(e.target.value || null)}
              className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground"
              disabled={!isAgentConnected}
            >
              <option value="">None (Local Chrome)</option>
              {effectiveStatus.peers
                .filter(peer => peer.online)
                .map(peer => (
                  <option key={peer.id} value={peer.tailscaleIP}>
                    {peer.hostname} ({peer.tailscaleIP})
                  </option>
                ))}
            </select>
          </div>

          {/* Chrome Status */}
          {chromeStatus && (
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  chromeStatus.connected ? 'bg-success' : 'bg-foreground-tertiary'
                }`}
              />
              <span className="text-sm text-foreground">
                {chromeStatus.connected
                  ? `Connected: ${chromeStatus.chromeHost}`
                  : 'Not Connected'}
              </span>
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
    </div>
  );
}

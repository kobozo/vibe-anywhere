'use client';

import React, { useState } from 'react';
import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

interface TailscaleStatus {
  online: boolean;
  tailscaleIP: string | null;
  hostname: string | null;
  tailnet: string | null;
  peerCount: number;
  version: string | null;
  exitNode: string | null;
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
}

export function TailscaleWidget({
  workspaceId,
  tailscaleStatus,
  chromeStatus,
  isAgentConnected,
  isTailscaleConfigured,
}: TailscaleWidgetProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!isTailscaleConfigured) {
      setError('Tailscale not configured. Please add OAuth token in Settings.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // First, generate an ephemeral auth key from the server
      const keyResponse = await fetch(`/api/workspaces/${workspaceId}/tailscale/auth-key`, {
        method: 'POST',
      });

      if (!keyResponse.ok) {
        const errorData = await keyResponse.json();
        throw new Error(errorData.error?.message || 'Failed to generate auth key');
      }

      const { data } = await keyResponse.json();
      const authKey = data.authKey;

      // Connect to WebSocket and request Tailscale connection
      const socket = io('/');
      const requestId = uuidv4();

      const result = await new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.disconnect();
          reject(new Error('Connection timeout'));
        }, 30000);

        socket.once(`tailscale:connect:response`, (response: { requestId: string; success: boolean; error?: string }) => {
          if (response.requestId === requestId) {
            clearTimeout(timeout);
            socket.disconnect();
            resolve({ success: response.success, error: response.error });
          }
        });

        socket.emit('tailscale:connect', { requestId, workspaceId, authKey });
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
    setIsDisconnecting(true);
    setError(null);

    try {
      const socket = io('/');
      const requestId = uuidv4();

      const result = await new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.disconnect();
          reject(new Error('Disconnection timeout'));
        }, 30000);

        socket.once(`tailscale:disconnect:response`, (response: { requestId: string; success: boolean; error?: string }) => {
          if (response.requestId === requestId) {
            clearTimeout(timeout);
            socket.disconnect();
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
    // Trigger a refresh by requesting status from agent
    try {
      const socket = io('/');
      const requestId = uuidv4();

      socket.emit('tailscale:status', { requestId, workspaceId });
      socket.disconnect();
    } catch (err) {
      console.error('Failed to refresh status:', err);
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
  } else if (tailscaleStatus?.online) {
    statusColor = 'bg-success';
    statusText = 'Connected';
    statusTitle = 'Connected to Tailscale network';
  } else if (tailscaleStatus === null) {
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
      {tailscaleStatus?.online && (
        <div className="space-y-2 mb-4 text-sm">
          <div className="flex justify-between">
            <span className="text-foreground-secondary">IP Address:</span>
            <span className="text-foreground font-mono">{tailscaleStatus.tailscaleIP || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground-secondary">Hostname:</span>
            <span className="text-foreground">{tailscaleStatus.hostname || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground-secondary">Tailnet:</span>
            <span className="text-foreground">{tailscaleStatus.tailnet || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground-secondary">Peers:</span>
            <span className="text-foreground">{tailscaleStatus.peerCount}</span>
          </div>
          {tailscaleStatus.exitNode && (
            <div className="flex justify-between">
              <span className="text-foreground-secondary">Exit Node:</span>
              <span className="text-foreground">{tailscaleStatus.exitNode}</span>
            </div>
          )}
        </div>
      )}

      {/* Chrome Status */}
      {chromeStatus && (
        <div className="border-t border-border pt-3 mb-4">
          <div className="text-xs text-foreground-secondary mb-2">Chrome Browser Control</div>
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
        </div>
      )}

      {/* Control Buttons */}
      {isTailscaleConfigured && isAgentConnected && (
        <div className="flex gap-2">
          {tailscaleStatus?.online ? (
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

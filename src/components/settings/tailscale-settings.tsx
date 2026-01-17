'use client';

import { useState, useEffect } from 'react';
import { useTailscaleSettings } from '@/hooks/useTailscaleSettings';

interface TailscaleSettingsProps {
  onSettingsChange?: () => void;
}

export function TailscaleSettings({ onSettingsChange }: TailscaleSettingsProps) {
  const {
    isConfigured,
    isLoading,
    error,
    fetchSettings,
    testConnection,
    saveOAuthToken,
    removeOAuthToken,
  } = useTailscaleSettings();

  const [oauthToken, setOAuthToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleTest = async () => {
    if (!oauthToken.trim()) return;

    setSaveError(null);
    setTestResult(null);
    setIsTesting(true);

    try {
      await testConnection(oauthToken.trim());
      setTestResult({ success: true, message: 'Connection successful!' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setTestResult({ success: false, message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!oauthToken.trim()) return;

    setSaveError(null);
    setTestResult(null);
    setIsSaving(true);

    try {
      await saveOAuthToken(oauthToken.trim());
      setOAuthToken('');
      onSettingsChange?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save OAuth token');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (
      !confirm(
        'Are you sure you want to remove the Tailscale OAuth token? Workspaces will not be able to join your tailnet.'
      )
    ) {
      return;
    }

    setSaveError(null);
    setTestResult(null);
    setIsSaving(true);

    try {
      await removeOAuthToken();
      onSettingsChange?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to remove OAuth token');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-foreground-secondary">
          Configure Tailscale OAuth token to enable workspaces to join your tailnet for secure
          Chrome browser control via MCP.
        </p>
        <p className="text-xs text-foreground-tertiary mt-1">
          OAuth tokens are used to generate ephemeral auth keys for each workspace.
        </p>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 p-3 bg-background-tertiary/30 rounded">
        <span
          className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-success' : 'bg-foreground-tertiary'}`}
        />
        <span className="text-sm text-foreground">
          {isLoading ? 'Checking...' : isConfigured ? 'Tailscale configured' : 'Tailscale not configured'}
        </span>
      </div>

      {/* Error display */}
      {(error || saveError) && (
        <div className="p-3 bg-error/20 border border-error/30 rounded text-sm text-error">
          {saveError || error?.message}
        </div>
      )}

      {/* Test result display */}
      {testResult && (
        <div
          className={`p-3 border rounded text-sm ${
            testResult.success
              ? 'bg-success/20 border-success/30 text-success'
              : 'bg-error/20 border-error/30 text-error'
          }`}
        >
          {testResult.message}
        </div>
      )}

      {/* OAuth Token input (only show if not configured) */}
      {!isConfigured && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-foreground-secondary mb-1">Tailscale OAuth Token</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={oauthToken}
                  onChange={(e) => {
                    setOAuthToken(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="tskey-..."
                  className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground placeholder-foreground-tertiary pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-foreground-secondary hover:text-foreground"
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
              <button
                onClick={handleTest}
                disabled={!oauthToken.trim() || isTesting || isSaving}
                className="px-4 py-2 bg-background-tertiary hover:bg-background-input disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-foreground border border-border-secondary"
              >
                {isTesting ? 'Testing...' : 'Test'}
              </button>
              <button
                onClick={handleSave}
                disabled={!oauthToken.trim() || isSaving || isTesting}
                className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-foreground"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <p className="text-xs text-foreground-tertiary">
            Generate an OAuth token from{' '}
            <a
              href="https://login.tailscale.com/admin/settings/oauth"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline"
            >
              login.tailscale.com/admin/settings/oauth
            </a>
          </p>
        </div>
      )}

      {/* Remove button (only show if configured) */}
      {isConfigured && (
        <div className="flex items-center justify-between p-3 bg-background-tertiary/30 rounded">
          <div>
            <span className="text-sm text-foreground">Tailscale OAuth Token</span>
            <span className="text-xs text-foreground-tertiary ml-2">(stored securely)</span>
          </div>
          <button
            onClick={handleRemove}
            disabled={isSaving}
            className="px-3 py-1.5 bg-error/20 hover:bg-error/40 disabled:opacity-50 rounded text-sm text-error"
          >
            {isSaving ? 'Removing...' : 'Remove'}
          </button>
        </div>
      )}

      {/* Chrome MCP Scripts */}
      {isConfigured && (
        <div className="mt-6 space-y-4">
          <h4 className="text-sm font-medium text-foreground">Chrome Browser Control Scripts</h4>

          {/* Mac Bridge Script */}
          <div className="p-4 bg-background-tertiary/20 rounded space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-sm font-medium text-foreground">Mac Bridge Server</h5>
                <p className="text-xs text-foreground-tertiary">Run on your Mac to forward Chrome extension to workspace</p>
              </div>
              <button
                onClick={() => {
                  const script = `#!/usr/bin/env node
/**
 * Claude Code Chrome MCP Bridge Server
 */

import net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs';

const execAsync = promisify(exec);
const TCP_PORT = 19222;
const connections = new Set();
const PLATFORM = os.platform();
const user = process.env.USER || process.env.USERNAME || os.userInfo().username;

function getSocketPath() {
  if (PLATFORM === 'win32') {
    return \`\\\\\\\\.\\\\pipe\\\\claude-mcp-browser-bridge-\${user}\`;
  } else if (PLATFORM === 'darwin') {
    const tmpdir = process.env.TMPDIR || '/tmp/';
    return \`\${tmpdir}claude-mcp-browser-bridge-\${user}\`;
  } else {
    return \`/tmp/claude-mcp-browser-bridge-\${user}\`;
  }
}

const SOCKET_PATH = getSocketPath();

async function getTailscaleIP() {
  if (process.env.TAILSCALE_IP) return process.env.TAILSCALE_IP;
  const paths = ['tailscale', '/usr/bin/tailscale', '/usr/local/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];
  for (const path of paths) {
    try {
      const { stdout } = await execAsync(\`"\${path}" ip -4\`);
      return stdout.trim();
    } catch { continue; }
  }
  console.error('Failed to get Tailscale IP');
  process.exit(1);
}

async function startBridge() {
  const tailscaleIP = await getTailscaleIP();
  console.log('='.repeat(60));
  console.log('Claude Code Chrome MCP Bridge Server');
  console.log('='.repeat(60));
  console.log(\`Platform: \${PLATFORM}\`);
  console.log(\`User: \${user}\`);
  console.log(\`Tailscale IP: \${tailscaleIP}\`);
  console.log(\`TCP Port: \${TCP_PORT}\`);
  console.log(\`Socket: \${SOCKET_PATH}\`);
  console.log('='.repeat(60));

  const server = net.createServer((clientSocket) => {
    const clientId = \`\${clientSocket.remoteAddress}:\${clientSocket.remotePort}\`;
    console.log(\`[\${new Date().toISOString()}] Client connected: \${clientId}\`);
    connections.add(clientSocket);
    const unixSocket = net.connect(SOCKET_PATH);
    unixSocket.on('connect', () => console.log(\`[\${new Date().toISOString()}] Connected to MCP bridge socket\`));

    clientSocket.on('data', async (data) => {
      const message = data.toString();
      if (message.includes('"type":"version"')) {
        console.log(\`[\${new Date().toISOString()}] Version query received\`);
        try {
          let chromeVersion = '';
          if (PLATFORM === 'darwin') {
            const { stdout } = await execAsync('/Applications/Google\\\\ Chrome.app/Contents/MacOS/Google\\\\ Chrome --version');
            chromeVersion = stdout.trim();
          } else if (PLATFORM === 'linux') {
            try { const { stdout } = await execAsync('google-chrome --version'); chromeVersion = stdout.trim(); }
            catch { const { stdout } = await execAsync('chromium-browser --version'); chromeVersion = stdout.trim(); }
          } else if (PLATFORM === 'win32') {
            const { stdout } = await execAsync('"C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe" --version');
            chromeVersion = stdout.trim();
          }
          console.log(\`[\${new Date().toISOString()}] Chrome version: \${chromeVersion}\`);
          clientSocket.write(chromeVersion);
        } catch (error) {
          console.error(\`[\${new Date().toISOString()}] Failed to get Chrome version:\`, error.message);
          clientSocket.write('Error: Could not get Chrome version');
        }
        return;
      }
      unixSocket.write(data);
    });

    unixSocket.on('data', (data) => clientSocket.write(data));
    const cleanup = () => { connections.delete(clientSocket); clientSocket.destroy(); unixSocket.destroy(); console.log(\`[\${new Date().toISOString()}] Client disconnected: \${clientId}\`); };
    clientSocket.on('error', (err) => { console.error(\`[\${new Date().toISOString()}] Client socket error:\`, err.message); cleanup(); });
    unixSocket.on('error', (err) => { console.error(\`[\${new Date().toISOString()}] Unix socket error:\`, err.message); if (err.code === 'ENOENT') console.error('\\n⚠️  MCP bridge socket not found. Is Claude Code running with --chrome?'); cleanup(); });
    clientSocket.on('end', cleanup);
    unixSocket.on('end', cleanup);
  });

  server.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(\`\\n✓ Bridge server listening on 0.0.0.0:\${TCP_PORT}\`);
    console.log(\`\\nRemote containers can now connect via: \${tailscaleIP}:\${TCP_PORT}\`);
    console.log('\\nPress Ctrl+C to stop the bridge server.\\n');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(\`\\n❌ Port \${TCP_PORT} is already in use.\`);
      console.error('Another bridge server may already be running.\\n');
      process.exit(1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  process.on('SIGINT', () => {
    console.log('\\n\\nShutting down bridge server...');
    for (const socket of connections) socket.destroy();
    connections.clear();
    server.close(() => { console.log('Bridge server stopped.'); process.exit(0); });
  });
}

startBridge().catch(err => { console.error('Failed to start bridge server:', err); process.exit(1); });`;
                  navigator.clipboard.writeText(script);
                  alert('Bridge script copied to clipboard!');
                }}
                className="px-3 py-1.5 bg-primary hover:bg-primary-hover rounded text-sm text-foreground"
              >
                Copy Script
              </button>
            </div>
            <p className="text-xs text-foreground-tertiary">
              Save as <code className="px-1 py-0.5 bg-background-tertiary rounded">chrome-bridge.js</code>, then run: <code className="px-1 py-0.5 bg-background-tertiary rounded">node chrome-bridge.js</code>
            </p>
          </div>

          {/* Chrome Native Host Script */}
          <div className="p-4 bg-background-tertiary/20 rounded space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-sm font-medium text-foreground">Chrome Native Host</h5>
                <p className="text-xs text-foreground-tertiary">Connects Chrome extension to remote workspace</p>
              </div>
              <button
                onClick={() => {
                  // Get workspace IP from somewhere - we'll need to pass this as a prop or fetch it
                  const script = `#!/usr/bin/env node
/**
 * Chrome Native Host for Mac
 * Connects to Claude Code MCP socket in remote workspace via Tailscale
 */

const net = require('net');

// TODO: Replace with your workspace Tailscale IP from workspace settings
const WORKSPACE_HOST = 'YOUR_WORKSPACE_TAILSCALE_IP';
const WORKSPACE_PORT = 19223;

const socket = net.connect(WORKSPACE_PORT, WORKSPACE_HOST);

socket.on('connect', () => {
  console.error('[Native Host] Connected to workspace Claude Code via Tailscale');
});

socket.on('data', (data) => process.stdout.write(data));
process.stdin.on('data', (data) => socket.write(data));

socket.on('error', (err) => {
  console.error('[Native Host] Socket error:', err.message);
  process.exit(1);
});

socket.on('end', () => {
  console.error('[Native Host] Connection closed');
  process.exit(0);
});

process.stdin.on('end', () => socket.end());`;
                  navigator.clipboard.writeText(script);
                  alert('Native host script copied! Remember to replace YOUR_WORKSPACE_TAILSCALE_IP with your workspace Tailscale IP.');
                }}
                className="px-3 py-1.5 bg-primary hover:bg-primary-hover rounded text-sm text-foreground"
              >
                Copy Script
              </button>
            </div>
            <p className="text-xs text-foreground-tertiary">
              Replace <code className="px-1 py-0.5 bg-background-tertiary rounded">chrome-native-host</code> in your Chrome native messaging directory
            </p>
            <p className="text-xs text-foreground-tertiary">
              Location: <code className="px-1 py-0.5 bg-background-tertiary rounded">~/Library/Application Support/Google/Chrome/NativeMessagingHosts/</code>
            </p>
          </div>

          <div className="p-3 bg-background-tertiary/10 rounded">
            <p className="text-xs text-foreground-tertiary">
              📖 Full setup guide:{' '}
              <a
                href="https://github.com/your-repo/vibe-anywhere/blob/main/docs/chrome-proxy.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary-hover underline"
              >
                docs/chrome-proxy.md
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-background-tertiary/20 rounded">
        <h4 className="text-sm font-medium text-foreground mb-2">How to set up Tailscale:</h4>
        <ol className="text-xs text-foreground-secondary space-y-1 list-decimal list-inside">
          <li>
            Create an OAuth client at{' '}
            <a
              href="https://login.tailscale.com/admin/settings/oauth"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline"
            >
              Tailscale Admin Console
            </a>
          </li>
          <li>Grant the OAuth client <kbd className="px-1 py-0.5 bg-background-tertiary rounded text-foreground">Write</kbd> permission for <kbd className="px-1 py-0.5 bg-background-tertiary rounded text-foreground">Devices</kbd></li>
          <li>Copy the generated OAuth token (starts with <code className="px-1 py-0.5 bg-background-tertiary rounded text-foreground">tskey-</code>)</li>
          <li>Paste it above and click Test to verify, then Save</li>
          <li>
            For Chrome MCP setup, see{' '}
            <a
              href="/docs/CHROME-MCP-SETUP.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline"
            >
              Chrome MCP Setup Guide
            </a>
          </li>
        </ol>
      </div>
    </div>
  );
}

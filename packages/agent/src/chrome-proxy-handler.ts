/**
 * Chrome CDP Proxy Handler
 * Creates a fake Chrome/Chromium binary and proxies CDP connections
 * to a remote Chrome instance via Tailscale
 */

import * as http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SocketProxyHandler } from './socket-proxy-handler.js';

const execAsync = promisify(exec);

export class ChromeProxyHandler {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private cdpPort = 9222; // Default CDP port
  private chromeHost: string | null = null;
  private chromeDir = path.join(process.env.HOME || '/home/kobozo', '.local', 'bin');
  private fakeChromeScript = '';
  private socketProxy: SocketProxyHandler;

  constructor() {
    this.fakeChromeScript = path.join(this.chromeDir, 'chromium');
    this.socketProxy = new SocketProxyHandler();

    // Ensure ~/.local/bin exists
    if (!fs.existsSync(this.chromeDir)) {
      fs.mkdirSync(this.chromeDir, { recursive: true });
    }
  }

  /**
   * Set the Chrome host (Tailscale IP) to proxy to
   */
  async setChromeHost(host: string | null): Promise<void> {
    console.log(`[Chrome Proxy] Setting Chrome host to: ${host || 'local'}`);
    this.chromeHost = host;

    // Create or update fake Chrome binary and start proxies
    if (host) {
      this.createFakeChromeScript(host);
      await this.startProxyServer();
      await this.startSocketProxy(host);
    } else {
      this.removeFakeChromeScript();
      await this.stopProxyServer();
      await this.stopSocketProxy();
    }
  }

  /**
   * Create a fake Chrome script that Claude Code will find
   * This script reports it's running on localhost:9222
   */
  private createFakeChromeScript(remoteHost: string): void {
    const scriptContent = `#!/bin/bash
# Fake Chrome/Chromium binary for CDP proxy
# This makes Claude Code think Chrome is running locally

# Handle --version flag (Claude Code checks this)
if [[ "$1" == "--version" ]]; then
  echo "Chromium 120.0.0.0"
  exit 0
fi

# Handle --remote-debugging-port flag
if [[ "$*" == *"--remote-debugging-port"* ]]; then
  # Extract port if specified
  PORT=$(echo "$*" | grep -oP '(?<=--remote-debugging-port=)\\d+')
  if [ -z "$PORT" ]; then
    PORT=9222
  fi

  # Report that we're "running" on the port
  echo "DevTools listening on ws://127.0.0.1:$PORT/devtools/browser"

  # Keep the process alive (Claude Code expects Chrome to stay running)
  sleep infinity
  exit 0
fi

# For other invocations, just report success
echo "Chromium proxy active - forwarding to ${remoteHost}:9222"
exit 0
`;

    try {
      // Write the script
      fs.writeFileSync(this.fakeChromeScript, scriptContent, { mode: 0o755 });
      console.log(`[Chrome Proxy] Created fake Chrome script at ${this.fakeChromeScript}`);

      // Also create symlinks for common Chrome names (in same directory)
      const symlinkNames = ['chrome', 'google-chrome', 'chromium-browser'];

      for (const name of symlinkNames) {
        const link = path.join(this.chromeDir, name);
        try {
          if (fs.existsSync(link)) {
            fs.unlinkSync(link);
          }
          fs.symlinkSync(this.fakeChromeScript, link);
        } catch (err) {
          // Ignore symlink errors
        }
      }
    } catch (error) {
      console.error('[Chrome Proxy] Failed to create fake Chrome script:', error);
    }
  }

  /**
   * Remove the fake Chrome script
   */
  private removeFakeChromeScript(): void {
    try {
      if (fs.existsSync(this.fakeChromeScript)) {
        fs.unlinkSync(this.fakeChromeScript);
        console.log(`[Chrome Proxy] Removed fake Chrome script`);
      }

      // Remove symlinks
      const symlinkNames = ['chrome', 'google-chrome', 'chromium-browser'];

      for (const name of symlinkNames) {
        const link = path.join(this.chromeDir, name);
        try {
          if (fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink()) {
            fs.unlinkSync(link);
          }
        } catch (err) {
          // Ignore errors
        }
      }
    } catch (error) {
      console.error('[Chrome Proxy] Failed to remove fake Chrome script:', error);
    }
  }

  /**
   * Start the CDP proxy server
   * Listens on localhost:9222 and forwards to remote Chrome
   */
  private async startProxyServer(): Promise<void> {
    if (this.server) {
      console.log('[Chrome Proxy] Server already running');
      return;
    }

    if (!this.chromeHost) {
      console.log('[Chrome Proxy] No Chrome host configured');
      return;
    }

    const remoteHost = this.chromeHost;

    try {
      // Create HTTP server for CDP JSON endpoints
      this.server = http.createServer(async (req, res) => {
        // Proxy HTTP requests to remote Chrome
        const url = `http://${remoteHost}:${this.cdpPort}${req.url}`;

        try {
          const response = await fetch(url);
          const data = await response.text();

          // Rewrite URLs to point to localhost
          const rewritten = data.replace(
            new RegExp(`${remoteHost}:${this.cdpPort}`, 'g'),
            `127.0.0.1:${this.cdpPort}`
          );

          res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json' });
          res.end(rewritten);
        } catch (error) {
          console.error('[Chrome Proxy] HTTP proxy error:', error);
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Bad Gateway - Unable to connect to remote Chrome');
        }
      });

      // Create WebSocket server for CDP protocol
      this.wss = new WebSocketServer({ server: this.server });

      this.wss.on('connection', (clientWs, req) => {
        console.log(`[Chrome Proxy] Client connected: ${req.url}`);

        // Extract WebSocket path and connect to remote Chrome
        const remotePath = req.url || '/';
        const remoteUrl = `ws://${remoteHost}:${this.cdpPort}${remotePath}`;

        console.log(`[Chrome Proxy] Proxying to: ${remoteUrl}`);

        const remoteWs = new WebSocket(remoteUrl);

        // Forward messages from client to remote
        clientWs.on('message', (data) => {
          if (remoteWs.readyState === WebSocket.OPEN) {
            remoteWs.send(data);
          }
        });

        // Forward messages from remote to client
        remoteWs.on('message', (data) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data);
          }
        });

        // Handle remote connection
        remoteWs.on('open', () => {
          console.log('[Chrome Proxy] Connected to remote Chrome');
        });

        remoteWs.on('error', (error) => {
          console.error('[Chrome Proxy] Remote WebSocket error:', error);
          clientWs.close();
        });

        remoteWs.on('close', () => {
          console.log('[Chrome Proxy] Remote connection closed');
          clientWs.close();
        });

        // Handle client disconnection
        clientWs.on('close', () => {
          console.log('[Chrome Proxy] Client disconnected');
          remoteWs.close();
        });

        clientWs.on('error', (error) => {
          console.error('[Chrome Proxy] Client WebSocket error:', error);
          remoteWs.close();
        });
      });

      // Start listening
      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.cdpPort, '127.0.0.1', () => {
          console.log(`[Chrome Proxy] Server listening on 127.0.0.1:${this.cdpPort}`);
          console.log(`[Chrome Proxy] Forwarding CDP to ${remoteHost}:${this.cdpPort}`);
          resolve();
        });

        this.server!.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            console.log(`[Chrome Proxy] Port ${this.cdpPort} already in use - proxy may already be running`);
            resolve(); // Don't treat this as fatal error
          } else {
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error('[Chrome Proxy] Failed to start proxy server:', error);
      this.server = null;
      this.wss = null;
    }
  }

  /**
   * Stop the proxy server
   */
  private async stopProxyServer(): Promise<void> {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      console.log('[Chrome Proxy] WebSocket server stopped');
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          console.log('[Chrome Proxy] HTTP server stopped');
          resolve();
        });
      });
      this.server = null;
    }
  }

  /**
   * Check if remote Chrome is accessible
   */
  async checkRemoteChrome(): Promise<boolean> {
    if (!this.chromeHost) {
      return false;
    }

    try {
      const response = await fetch(`http://${this.chromeHost}:${this.cdpPort}/json/version`, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[Chrome Proxy] Remote Chrome detected:', data.Browser);
        return true;
      }
    } catch (error) {
      console.log('[Chrome Proxy] Remote Chrome not accessible:', error);
    }

    return false;
  }

  /**
   * Get Chrome connection status
   */
  async getStatus(): Promise<{ connected: boolean; chromeHost: string | null; socketProxyRunning: boolean }> {
    // For socket proxy mode, we check if the proxy is running
    // CDP check is less relevant since we're not using it for the actual connection
    const socketProxyRunning = this.socketProxy.isRunning();

    // Only check CDP if we want to verify Chrome is actually accessible
    // But don't fail the status if CDP check fails - socket proxy is what matters
    let connected = false;
    if (this.chromeHost && socketProxyRunning) {
      // Socket proxy is running, consider it connected
      connected = true;
    }

    return {
      connected,
      chromeHost: this.chromeHost,
      socketProxyRunning,
    };
  }

  /**
   * Start the Unix socket proxy
   */
  private async startSocketProxy(host: string): Promise<void> {
    try {
      await this.socketProxy.start(host);
    } catch (error) {
      console.error('[Chrome Proxy] Failed to start socket proxy:', error);
    }
  }

  /**
   * Stop the Unix socket proxy
   */
  private async stopSocketProxy(): Promise<void> {
    try {
      await this.socketProxy.stop();
    } catch (error) {
      console.error('[Chrome Proxy] Failed to stop socket proxy:', error);
    }
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup(): Promise<void> {
    await this.stopProxyServer();
    await this.stopSocketProxy();
    this.removeFakeChromeScript();
  }
}

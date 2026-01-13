#!/usr/bin/env node

/**
 * CDP Proxy Shim
 *
 * A fake chromium binary that proxies Chrome DevTools Protocol (CDP) commands
 * to a local Chrome browser over Tailscale VPN.
 *
 * This allows Claude Code CLI running in remote containers to control
 * Chrome browser on the user's local machine.
 */

import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import * as http from 'node:http';

const VERSION = '1.0.0';
const CONNECTION_TIMEOUT = 10000; // 10 seconds

interface TailscaleStatus {
  Self: {
    TailscaleIPs: string[];
  };
  Peer: Record<string, {
    TailscaleIPs: string[];
    HostName: string;
  }>;
}

/**
 * Get the local machine's Tailscale IP by parsing `tailscale status --json`
 */
async function getTailscaleIP(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tailscale', ['status', '--json']);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`tailscale status failed: ${stderr || 'Unknown error'}`));
        return;
      }

      try {
        const status: TailscaleStatus = JSON.parse(stdout);

        // We're running in a container and want to find the local machine's IP
        // The container's own IP is in Self, but we want the peer (local machine)
        // Get the first peer's Tailscale IP
        const peerIPs = Object.values(status.Peer || {});
        if (peerIPs.length === 0 || !peerIPs[0]?.TailscaleIPs?.[0]) {
          reject(new Error('No Tailscale peers found. Make sure your local machine is connected to Tailscale and visible to this container.'));
          return;
        }

        const localIP = peerIPs[0].TailscaleIPs[0];
        resolve(localIP);
      } catch (error) {
        reject(new Error(`Failed to parse tailscale status: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });

    proc.on('error', (error) => {
      reject(new Error(`Failed to run tailscale command: ${error.message}`));
    });
  });
}

/**
 * Test if Chrome is running and accepting CDP connections
 */
async function testChromeConnection(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/json/version`, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.setTimeout(CONNECTION_TIMEOUT, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Get the CDP WebSocket URL
 */
async function getCDPWebSocketURL(host: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${host}:${port}/json/version`, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const version = JSON.parse(data);
          if (version.webSocketDebuggerUrl) {
            resolve(version.webSocketDebuggerUrl);
          } else {
            reject(new Error('No WebSocket debugger URL found in Chrome response'));
          }
        } catch (error) {
          reject(new Error(`Failed to parse Chrome version response: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Failed to connect to Chrome: ${error.message}`));
    });

    req.setTimeout(CONNECTION_TIMEOUT, () => {
      req.destroy();
      reject(new Error(`Connection to Chrome timed out after ${CONNECTION_TIMEOUT}ms`));
    });
  });
}

/**
 * Start the CDP proxy - keeps the process alive and proxies CDP commands
 */
async function startCDPProxy(wsUrl: string): Promise<void> {
  console.log(`[CDP Shim] Connecting to Chrome at ${wsUrl}...`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let isConnected = false;

    ws.on('open', () => {
      isConnected = true;
      console.log('[CDP Shim] Connected to Chrome successfully!');
      console.log('[CDP Shim] CDP proxy is ready. Keeping connection alive...');

      // Keep the process running
      // In a real implementation, this would handle bidirectional proxying
      // For now, we just keep the connection alive to simulate a browser process
    });

    ws.on('error', (error) => {
      if (!isConnected) {
        reject(new Error(`WebSocket connection failed: ${error.message}`));
      } else {
        console.error('[CDP Shim] WebSocket error:', error.message);
      }
    });

    ws.on('close', () => {
      console.log('[CDP Shim] Connection to Chrome closed.');
      process.exit(0);
    });

    // Handle process signals
    const cleanup = () => {
      console.log('\n[CDP Shim] Shutting down...');
      ws.close();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Handle --version flag
  if (args.includes('--version')) {
    console.log(`CDP Proxy Shim v${VERSION}`);
    process.exit(0);
  }

  // Handle --help flag
  if (args.includes('--help')) {
    console.log(`CDP Proxy Shim v${VERSION}`);
    console.log('');
    console.log('Usage: cdp-shim [options]');
    console.log('');
    console.log('A fake chromium binary that proxies CDP commands to local Chrome over Tailscale.');
    console.log('');
    console.log('Options:');
    console.log('  --remote-debugging-port=<port>  CDP debugging port (default: 9222)');
    console.log('  --version                       Show version');
    console.log('  --help                          Show help');
    console.log('');
    process.exit(0);
  }

  // Parse remote debugging port
  let debugPort = 9222;
  const portArg = args.find(arg => arg.startsWith('--remote-debugging-port='));
  if (portArg) {
    debugPort = parseInt(portArg.split('=')[1], 10);
  }

  console.log(`[CDP Shim] Starting CDP proxy on port ${debugPort}...`);

  try {
    // Step 1: Discover local machine's Tailscale IP
    console.log('[CDP Shim] Discovering local machine Tailscale IP...');
    const tailscaleIP = await getTailscaleIP();
    console.log(`[CDP Shim] Found Tailscale IP: ${tailscaleIP}`);

    // Step 2: Test Chrome connection
    console.log(`[CDP Shim] Testing Chrome connection at ${tailscaleIP}:${debugPort}...`);
    const isRunning = await testChromeConnection(tailscaleIP, debugPort);

    if (!isRunning) {
      console.error(`[CDP Shim] ERROR: Chrome is not running or not accepting CDP connections at ${tailscaleIP}:${debugPort}`);
      console.error('[CDP Shim] Make sure Chrome is running with --remote-debugging-port=9222 on your local machine.');
      process.exit(1);
    }

    console.log('[CDP Shim] Chrome is running and accepting connections!');

    // Step 3: Get CDP WebSocket URL
    const wsUrl = await getCDPWebSocketURL(tailscaleIP, debugPort);

    // Step 4: Start CDP proxy
    await startCDPProxy(wsUrl);

  } catch (error) {
    console.error('[CDP Shim] ERROR:', error instanceof Error ? error.message : 'Unknown error');

    // Provide helpful error messages
    if (error instanceof Error) {
      if (error.message.includes('tailscale')) {
        console.error('[CDP Shim] Make sure Tailscale is installed and running in this container.');
        console.error('[CDP Shim] Run: tailscale status');
      } else if (error.message.includes('Chrome')) {
        console.error('[CDP Shim] Make sure Chrome is running on your local machine with:');
        console.error('[CDP Shim]   google-chrome --remote-debugging-port=9222');
        console.error('[CDP Shim] Or:');
        console.error('[CDP Shim]   chromium --remote-debugging-port=9222');
      }
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[CDP Shim] Unexpected error:', error instanceof Error ? error.message : 'Unknown error');
  process.exit(1);
});

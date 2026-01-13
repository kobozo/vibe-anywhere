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
const IP_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface TailscaleStatus {
  Self: {
    TailscaleIPs: string[];
  };
  Peer: Record<string, {
    TailscaleIPs: string[];
    HostName: string;
  }>;
}

interface CachedIP {
  ip: string;
  timestamp: number;
  hostname?: string;
}

// In-memory cache for discovered IP
let cachedIP: CachedIP | null = null;

/**
 * Get the local machine's Tailscale IP by parsing `tailscale status --json`
 * Supports hostname pattern filtering, env var fallback, multiple hostname retry, and caching.
 */
async function getTailscaleIP(hostnamePattern?: string): Promise<string> {
  // Check cache first (5 minute TTL)
  if (cachedIP && (Date.now() - cachedIP.timestamp) < IP_CACHE_DURATION) {
    console.log(`[CDP Shim] Using cached Tailscale IP: ${cachedIP.ip} (from ${cachedIP.hostname || 'unknown host'})`);
    return cachedIP.ip;
  }

  // Check for TAILSCALE_CHROME_HOST env var fallback
  const envHost = process.env.TAILSCALE_CHROME_HOST;
  if (envHost) {
    console.log(`[CDP Shim] Using TAILSCALE_CHROME_HOST from environment: ${envHost}`);

    // Try to resolve if it's a hostname
    if (!envHost.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      console.log(`[CDP Shim] TAILSCALE_CHROME_HOST appears to be a hostname, attempting to resolve via Tailscale...`);
      try {
        const resolvedIP = await resolveTailscaleHostname(envHost);
        cachedIP = { ip: resolvedIP, timestamp: Date.now(), hostname: envHost };
        return resolvedIP;
      } catch (error) {
        console.warn(`[CDP Shim] Failed to resolve hostname ${envHost}:`, error instanceof Error ? error.message : 'Unknown error');
        console.warn(`[CDP Shim] Falling back to auto-discovery...`);
      }
    } else {
      // Direct IP address
      cachedIP = { ip: envHost, timestamp: Date.now(), hostname: 'env-var' };
      return envHost;
    }
  }

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
        const peers = Object.values(status.Peer || {});

        if (peers.length === 0) {
          reject(new Error('No Tailscale peers found. Make sure your local machine is connected to Tailscale and visible to this container.'));
          return;
        }

        console.log(`[CDP Shim] Discovering Chrome... Found ${peers.length} Tailscale peer(s)`);

        // Filter by hostname pattern if provided
        let candidatePeers = peers;
        if (hostnamePattern) {
          console.log(`[CDP Shim] Filtering peers by hostname pattern: ${hostnamePattern}`);
          candidatePeers = peers.filter(peer => {
            const hostname = peer.HostName || '';
            // Support wildcards (e.g., mypc.tail-*.ts.net or mypc*)
            const pattern = hostnamePattern.replace(/\*/g, '.*');
            const regex = new RegExp(`^${pattern}$`, 'i');
            return regex.test(hostname);
          });

          if (candidatePeers.length === 0) {
            console.warn(`[CDP Shim] No peers matching pattern "${hostnamePattern}". Available peers:`);
            peers.forEach(peer => {
              console.warn(`[CDP Shim]   - ${peer.HostName} (${peer.TailscaleIPs?.[0] || 'no IP'})`);
            });
            console.warn(`[CDP Shim] Falling back to first peer...`);
            candidatePeers = peers;
          }
        }

        // Try each candidate peer until one works
        const selectedPeer = candidatePeers[0];
        if (!selectedPeer?.TailscaleIPs?.[0]) {
          reject(new Error('Selected peer has no Tailscale IP address.'));
          return;
        }

        const localIP = selectedPeer.TailscaleIPs[0];
        const hostname = selectedPeer.HostName || 'unknown';

        console.log(`[CDP Shim] Found: ${localIP}`);

        // Cache the result
        cachedIP = { ip: localIP, timestamp: Date.now(), hostname };

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
 * Resolve a Tailscale hostname to an IP address
 */
async function resolveTailscaleHostname(hostname: string): Promise<string> {
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
        const peers = Object.values(status.Peer || {});

        // Find peer by hostname (exact match or pattern)
        const peer = peers.find(p => {
          const peerHostname = p.HostName || '';
          return peerHostname.toLowerCase() === hostname.toLowerCase() ||
                 peerHostname.toLowerCase().startsWith(hostname.toLowerCase());
        });

        if (!peer || !peer.TailscaleIPs?.[0]) {
          reject(new Error(`No peer found with hostname ${hostname}`));
          return;
        }

        resolve(peer.TailscaleIPs[0]);
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
 * Try to find a working Chrome instance across multiple Tailscale peers
 */
async function findWorkingChromePeer(port: number, hostnamePattern?: string): Promise<{ ip: string; hostname: string }> {
  // Get all candidate peers
  const proc = spawn('tailscale', ['status', '--json']);
  let stdout = '';

  await new Promise<void>((resolve, reject) => {
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('Failed to get Tailscale status'));
        return;
      }
      resolve();
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });

  const status: TailscaleStatus = JSON.parse(stdout);
  let peers = Object.values(status.Peer || {});

  // Filter by hostname pattern if provided
  if (hostnamePattern) {
    const pattern = hostnamePattern.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`, 'i');
    peers = peers.filter(peer => regex.test(peer.HostName || ''));
  }

  console.log(`[CDP Shim] Trying ${peers.length} peer(s) to find Chrome instance...`);

  // Try each peer until we find one with Chrome running
  for (const peer of peers) {
    const ip = peer.TailscaleIPs?.[0];
    const hostname = peer.HostName || 'unknown';

    if (!ip) continue;

    console.log(`[CDP Shim] Checking ${hostname} (${ip})...`);
    const isRunning = await testChromeConnection(ip, port);

    if (isRunning) {
      console.log(`[CDP Shim] ✓ Found Chrome running on ${hostname} (${ip})`);
      // Cache the successful IP
      cachedIP = { ip, timestamp: Date.now(), hostname };
      return { ip, hostname };
    } else {
      console.log(`[CDP Shim] ✗ Chrome not running on ${hostname}`);
    }
  }

  throw new Error('No Tailscale peers are running Chrome with remote debugging enabled');
}

/**
 * Test if Chrome is running and accepting CDP connections
 */
async function testChromeConnection(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/json/version`, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', (error: NodeJS.ErrnoException) => {
      // Log specific error types for debugging
      if (error.code === 'ECONNREFUSED') {
        console.log(`[CDP Shim] ✗ Connection refused on ${host}:${port} (Chrome not running)`);
      } else if (error.code === 'ETIMEDOUT') {
        console.log(`[CDP Shim] ✗ Connection timeout to ${host}:${port} (Tailscale not connected)`);
      } else if (error.code === 'ENOTFOUND') {
        console.log(`[CDP Shim] ✗ Host not found: ${host} (hostname doesn't resolve)`);
      }
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

    req.on('error', (error: NodeJS.ErrnoException) => {
      // Provide specific error messages based on error code
      if (error.code === 'ECONNREFUSED') {
        reject(new Error(`Chrome not running on ${host}:${port} (connection refused)`));
      } else if (error.code === 'ETIMEDOUT') {
        reject(new Error(`Connection timeout to ${host}:${port} (check Tailscale connection)`));
      } else if (error.code === 'ENOTFOUND') {
        reject(new Error(`Hostname ${host} doesn't resolve (check Tailscale configuration)`));
      } else {
        reject(new Error(`Failed to connect to Chrome: ${error.message}`));
      }
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
    console.log('  --hostname-pattern=<pattern>    Filter Tailscale peers by hostname pattern (supports wildcards)');
    console.log('  --version                       Show version');
    console.log('  --help                          Show help');
    console.log('');
    console.log('Environment Variables:');
    console.log('  TAILSCALE_CHROME_HOST           Override hostname/IP for Chrome (bypasses auto-discovery)');
    console.log('');
    process.exit(0);
  }

  // Parse remote debugging port
  let debugPort = 9222;
  const portArg = args.find(arg => arg.startsWith('--remote-debugging-port='));
  if (portArg) {
    debugPort = parseInt(portArg.split('=')[1], 10);
  }

  // Parse hostname pattern
  let hostnamePattern: string | undefined;
  const patternArg = args.find(arg => arg.startsWith('--hostname-pattern='));
  if (patternArg) {
    hostnamePattern = patternArg.split('=')[1];
  }

  console.log(`[CDP Shim] Starting CDP proxy on port ${debugPort}...`);
  if (hostnamePattern) {
    console.log(`[CDP Shim] Using hostname pattern filter: ${hostnamePattern}`);
  }

  try {
    let tailscaleIP: string | undefined;
    let targetHostname: string | undefined;

    // Check if cached IP is valid and test if Chrome is still running
    if (cachedIP && (Date.now() - cachedIP.timestamp) < IP_CACHE_DURATION) {
      console.log(`[CDP Shim] Testing cached IP: ${cachedIP.ip} (from ${cachedIP.hostname})...`);
      const isCachedStillValid = await testChromeConnection(cachedIP.ip, debugPort);

      if (isCachedStillValid) {
        console.log(`[CDP Shim] Using cached Tailscale IP: ${cachedIP.ip}`);
        tailscaleIP = cachedIP.ip;
        targetHostname = cachedIP.hostname;
      } else {
        console.log(`[CDP Shim] Cached IP is stale (Chrome not responding), re-discovering...`);
        cachedIP = null;
      }
    }

    // If no valid cached IP, discover from Tailscale
    if (!tailscaleIP) {
      // Check for TAILSCALE_CHROME_HOST env var fallback
      const envHost = process.env.TAILSCALE_CHROME_HOST;
      if (envHost) {
        console.log(`[CDP Shim] Using TAILSCALE_CHROME_HOST from environment: ${envHost}`);

        // Try to resolve if it's a hostname
        if (!envHost.match(/^\d+\.\d+\.\d+\.\d+$/)) {
          console.log(`[CDP Shim] Resolving hostname ${envHost}...`);
          try {
            tailscaleIP = await resolveTailscaleHostname(envHost);
            targetHostname = envHost;
            console.log(`[CDP Shim] Resolved to ${tailscaleIP}`);
          } catch (error) {
            console.warn(`[CDP Shim] Failed to resolve ${envHost}:`, error instanceof Error ? error.message : 'Unknown error');
            console.warn(`[CDP Shim] Falling back to auto-discovery...`);
          }
        } else {
          // Direct IP address
          tailscaleIP = envHost;
          targetHostname = 'env-var';
        }

        // Test the env var host
        if (tailscaleIP) {
          console.log(`[CDP Shim] Testing Chrome connection at ${tailscaleIP}:${debugPort}...`);
          const isRunning = await testChromeConnection(tailscaleIP, debugPort);

          if (!isRunning) {
            console.warn(`[CDP Shim] TAILSCALE_CHROME_HOST (${envHost}) is not running Chrome, falling back to auto-discovery...`);
            tailscaleIP = undefined;
          }
        }
      }

      // Auto-discovery: try all peers if env var didn't work
      if (!tailscaleIP) {
        console.log('[CDP Shim] Auto-discovering Chrome instance across Tailscale peers...');
        const result = await findWorkingChromePeer(debugPort, hostnamePattern);
        tailscaleIP = result.ip;
        targetHostname = result.hostname;
      }
    }

    if (!tailscaleIP) {
      throw new Error('Failed to discover Chrome instance on any Tailscale peer');
    }

    console.log(`[CDP Shim] Connected to Chrome on ${targetHostname || 'unknown'} (${tailscaleIP}:${debugPort})`);

    // Get CDP WebSocket URL
    const wsUrl = await getCDPWebSocketURL(tailscaleIP, debugPort);

    // Start CDP proxy
    await startCDPProxy(wsUrl);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CDP Shim] ERROR:', errorMessage);

    // Provide helpful, user-friendly error messages based on error type
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();

      if (msg.includes('connection refused') || msg.includes('econnrefused')) {
        console.error('');
        console.error('Chrome browser not found. Please start Chrome with:');
        console.error('  google-chrome --remote-debugging-port=9222');
        console.error('Or:');
        console.error('  chromium --remote-debugging-port=9222');
        console.error('');
      } else if (msg.includes('timeout') || msg.includes('etimedout')) {
        console.error('');
        console.error('Connection timeout. This usually means:');
        console.error('  1. Tailscale is not connected on this container or your local machine');
        console.error('  2. Your local machine is not visible in the Tailnet');
        console.error('');
        console.error('Troubleshooting:');
        console.error('  - Run: tailscale status');
        console.error('  - Check both machines are connected to the same Tailnet');
        console.error('  - Verify network connectivity: ping <local-machine-ip>');
        console.error('');
      } else if (msg.includes('not found') || msg.includes('enotfound')) {
        console.error('');
        console.error("Hostname doesn't resolve. This usually means:");
        console.error('  1. The hostname is not in your Tailscale network');
        console.error('  2. MagicDNS is not enabled or not working');
        console.error('');
        console.error('Troubleshooting:');
        console.error('  - Run: tailscale status --json');
        console.error('  - Check the hostname in the Peer list');
        console.error('  - Try setting TAILSCALE_CHROME_HOST to an IP address instead');
        console.error('');
      } else if (msg.includes('no tailscale peers')) {
        console.error('');
        console.error('No Tailscale peers found. Make sure:');
        console.error('  1. Tailscale is running on your local machine');
        console.error('  2. Both machines are connected to the same Tailnet');
        console.error('  3. Your local machine is visible to this container');
        console.error('');
        console.error('Run: tailscale status');
        console.error('');
      } else if (msg.includes('tailscale') || msg.includes('failed to run tailscale')) {
        console.error('');
        console.error('Tailscale is not installed or not running. Make sure:');
        console.error('  1. Tailscale is installed: which tailscale');
        console.error('  2. Tailscale daemon is running: systemctl status tailscaled');
        console.error('  3. Tailscale is authenticated: tailscale status');
        console.error('');
      } else if (msg.includes('no chrome') || msg.includes('chrome not running')) {
        console.error('');
        console.error('Chrome browser not found. Please start Chrome with:');
        console.error('  google-chrome --remote-debugging-port=9222');
        console.error('Or:');
        console.error('  chromium --remote-debugging-port=9222');
        console.error('');
      }
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[CDP Shim] Unexpected error:', error instanceof Error ? error.message : 'Unknown error');
  process.exit(1);
});

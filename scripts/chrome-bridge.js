#!/usr/bin/env node
/**
 * Claude Code Chrome MCP Bridge Server
 *
 * This script bridges TCP connections from Tailscale to the local
 * Claude Code MCP browser bridge socket (Unix socket on Mac/Linux, Named Pipe on Windows).
 *
 * Supports: MacOS, Linux, Windows
 *
 * Usage:
 *   chrome-bridge          (as standalone binary)
 *   node chrome-bridge.js  (if running as script)
 *
 * Prerequisites:
 *   1. Chrome with Claude extension installed
 *   2. Claude Code CLI installed
 *   3. Claude Code running with --chrome flag (creates the MCP bridge socket)
 *   4. Tailscale connected
 *
 * The script:
 *   - Auto-detects platform (MacOS/Linux/Windows)
 *   - Detects Tailscale IP automatically
 *   - Listens on TCP port 19222 (all interfaces)
 *   - Forwards to platform-specific MCP bridge socket
 */

import net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs';

const execAsync = promisify(exec);

const TCP_PORT = 19222;
const connections = new Set();

// Detect platform
const PLATFORM = os.platform(); // 'darwin', 'linux', 'win32'

// Get user
const user = process.env.USER || process.env.USERNAME || os.userInfo().username;

/**
 * Get the MCP bridge socket path for the current platform
 */
function getSocketPath() {
  if (PLATFORM === 'win32') {
    // Windows uses Named Pipes
    return `\\\\.\\pipe\\claude-mcp-browser-bridge-${user}`;
  } else if (PLATFORM === 'darwin') {
    // macOS uses TMPDIR (usually /var/folders/.../T/)
    const tmpdir = process.env.TMPDIR || '/tmp/';
    const socketPath = `${tmpdir}claude-mcp-browser-bridge-${user}`;
    return socketPath;
  } else {
    // Linux uses /tmp
    return `/tmp/claude-mcp-browser-bridge-${user}`;
  }
}

const SOCKET_PATH = getSocketPath();

/**
 * Get Tailscale IP address
 */
async function getTailscaleIP() {
  // Check if manually specified via environment variable
  if (process.env.TAILSCALE_IP) {
    console.log(`Using Tailscale IP from environment: ${process.env.TAILSCALE_IP}`);
    return process.env.TAILSCALE_IP;
  }

  // Try different Tailscale CLI locations
  const tailscalePaths = [
    'tailscale', // In PATH
    '/usr/bin/tailscale', // Linux
    '/usr/local/bin/tailscale', // Homebrew on Mac
    '/Applications/Tailscale.app/Contents/MacOS/Tailscale', // Mac GUI app
  ];

  for (const tailscalePath of tailscalePaths) {
    try {
      const { stdout } = await execAsync(`"${tailscalePath}" ip -4`);
      return stdout.trim();
    } catch (error) {
      // Try next path
      continue;
    }
  }

  // If all attempts failed, show helpful error
  console.error('Failed to get Tailscale IP. Is Tailscale running?');
  console.error('\nTroubleshooting:');
  console.error('1. Check Tailscale is running:');
  if (PLATFORM === 'darwin') {
    console.error('   /Applications/Tailscale.app/Contents/MacOS/Tailscale status');
  } else if (PLATFORM === 'win32') {
    console.error('   tailscale status');
  } else {
    console.error('   tailscale status');
  }
  console.error('2. Verify you have a Tailscale IP:');
  if (PLATFORM === 'darwin') {
    console.error('   /Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4');
  } else if (PLATFORM === 'win32') {
    console.error('   tailscale ip -4');
  } else {
    console.error('   tailscale ip -4');
  }
  console.error('\n3. Or manually specify your Tailscale IP:');
  console.error('   Set TAILSCALE_IP environment variable:');
  console.error('   TAILSCALE_IP=100.x.x.x node chrome-bridge.js');
  process.exit(1);
}

/**
 * Check if Claude Code MCP bridge socket exists
 */
function checkSocket() {
  if (PLATFORM === 'win32') {
    // On Windows, we can't easily check Named Pipe existence before connecting
    console.log(`⏳ Will attempt to connect to: ${SOCKET_PATH}`);
    console.warn('If connection fails, make sure Claude Code is running with --chrome flag.');
  } else {
    // Unix socket check for Mac/Linux
    if (!fs.existsSync(SOCKET_PATH)) {
      console.warn(`\n⚠️  Warning: MCP bridge socket not found: ${SOCKET_PATH}`);
      console.warn('Make sure Claude Code is running with --chrome flag.');
      console.warn('Example: claude --chrome\n');
    } else {
      console.log(`✓ MCP bridge socket found: ${SOCKET_PATH}`);
    }
  }
}

/**
 * Create TCP server that forwards to Unix socket
 */
async function startBridge() {
  const tailscaleIP = await getTailscaleIP();

  const platformName = {
    'darwin': 'MacOS',
    'linux': 'Linux',
    'win32': 'Windows'
  }[PLATFORM] || PLATFORM;

  console.log('='.repeat(60));
  console.log('Claude Code Chrome MCP Bridge Server');
  console.log('='.repeat(60));
  console.log(`Platform: ${platformName}`);
  console.log(`User: ${user}`);
  console.log(`Tailscale IP: ${tailscaleIP}`);
  console.log(`TCP Port: ${TCP_PORT}`);
  console.log(`Socket: ${SOCKET_PATH}`);
  console.log('='.repeat(60));

  checkSocket();

  const server = net.createServer((clientSocket) => {
    const clientId = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
    console.log(`[${new Date().toISOString()}] Client connected: ${clientId}`);
    connections.add(clientSocket);

    // Connect to local Unix socket
    const unixSocket = net.connect(SOCKET_PATH);

    unixSocket.on('connect', () => {
      console.log(`[${new Date().toISOString()}] Connected to MCP bridge socket`);
    });

    // Pipe data bidirectionally
    clientSocket.pipe(unixSocket);
    unixSocket.pipe(clientSocket);

    // Handle errors and cleanup
    const cleanup = () => {
      connections.delete(clientSocket);
      clientSocket.destroy();
      unixSocket.destroy();
      console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId}`);
    };

    clientSocket.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] Client socket error:`, err.message);
      cleanup();
    });

    unixSocket.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] Unix socket error:`, err.message);
      if (err.code === 'ENOENT') {
        console.error('\n⚠️  MCP bridge socket not found. Is Claude Code running with --chrome?');
      }
      cleanup();
    });

    clientSocket.on('end', () => {
      cleanup();
    });

    unixSocket.on('end', () => {
      cleanup();
    });
  });

  // Listen on all interfaces (allows Tailscale connections)
  server.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(`\n✓ Bridge server listening on 0.0.0.0:${TCP_PORT}`);
    console.log(`\nRemote containers can now connect via: ${tailscaleIP}:${TCP_PORT}`);
    console.log('\nPress Ctrl+C to stop the bridge server.\n');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${TCP_PORT} is already in use.`);
      console.error('Another bridge server may already be running.\n');
      process.exit(1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down bridge server...');

    // Close all connections
    for (const socket of connections) {
      socket.destroy();
    }
    connections.clear();

    server.close(() => {
      console.log('Bridge server stopped.');
      process.exit(0);
    });
  });
}

// Start the bridge
startBridge().catch(err => {
  console.error('Failed to start bridge server:', err);
  process.exit(1);
});

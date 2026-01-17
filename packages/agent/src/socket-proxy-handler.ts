/**
 * Unix Socket Proxy Handler
 * Proxies Unix socket connections to remote host via TCP over Tailscale
 * Used to proxy Claude Code's MCP browser bridge to remote Chrome
 */

import * as net from 'net';
import * as fs from 'fs';
import { promisify } from 'util';

const unlink = promisify(fs.unlink);

export class SocketProxyHandler {
  private server: net.Server | null = null;
  private remoteHost: string | null = null;
  private remotePort = 19222; // TCP port for socket proxy on remote
  private localSocketPath = '';
  private connections = new Set<net.Socket>();

  constructor() {
    // Socket path for Claude Code MCP browser bridge
    const user = process.env.USER || 'kobozo';
    this.localSocketPath = `/tmp/claude-mcp-browser-bridge-${user}`;
  }

  /**
   * Start proxying Unix socket to remote host
   */
  async start(remoteHost: string): Promise<void> {
    if (this.server) {
      console.log('[Socket Proxy] Server already running');
      return;
    }

    this.remoteHost = remoteHost;
    console.log(`[Socket Proxy] Starting proxy to ${remoteHost}:${this.remotePort}`);

    // Remove existing socket file if it exists
    try {
      await unlink(this.localSocketPath);
    } catch (err) {
      // Ignore if file doesn't exist
    }

    // Create Unix socket server
    this.server = net.createServer((clientSocket) => {
      console.log('[Socket Proxy] Client connected to local Unix socket');
      this.connections.add(clientSocket);

      // Connect to remote TCP socket
      const remoteSocket = new net.Socket();

      remoteSocket.connect(this.remotePort, this.remoteHost!, () => {
        console.log(`[Socket Proxy] Connected to remote ${this.remoteHost}:${this.remotePort}`);
      });

      // Pipe data bidirectionally
      clientSocket.pipe(remoteSocket);
      remoteSocket.pipe(clientSocket);

      // Handle errors and cleanup
      const cleanup = () => {
        this.connections.delete(clientSocket);
        clientSocket.destroy();
        remoteSocket.destroy();
      };

      clientSocket.on('error', (err) => {
        console.error('[Socket Proxy] Client socket error:', err.message);
        cleanup();
      });

      remoteSocket.on('error', (err) => {
        console.error('[Socket Proxy] Remote socket error:', err.message);
        cleanup();
      });

      clientSocket.on('end', () => {
        console.log('[Socket Proxy] Client disconnected');
        cleanup();
      });

      remoteSocket.on('end', () => {
        console.log('[Socket Proxy] Remote disconnected');
        cleanup();
      });
    });

    // Start listening on Unix socket
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.localSocketPath, () => {
        console.log(`[Socket Proxy] Listening on ${this.localSocketPath}`);
        console.log(`[Socket Proxy] Proxying to ${remoteHost}:${this.remotePort}`);
        resolve();
      });

      this.server!.on('error', (err) => {
        console.error('[Socket Proxy] Server error:', err);
        reject(err);
      });
    });
  }

  /**
   * Stop the proxy server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    console.log('[Socket Proxy] Stopping proxy server');

    // Close all active connections
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();

    // Close server
    await new Promise<void>((resolve) => {
      this.server!.close(() => {
        console.log('[Socket Proxy] Server stopped');
        resolve();
      });
    });

    this.server = null;

    // Remove socket file
    try {
      await unlink(this.localSocketPath);
    } catch (err) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Check if proxy is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Get current configuration
   */
  getConfig(): { remoteHost: string | null; localSocketPath: string } {
    return {
      remoteHost: this.remoteHost,
      localSocketPath: this.localSocketPath,
    };
  }
}

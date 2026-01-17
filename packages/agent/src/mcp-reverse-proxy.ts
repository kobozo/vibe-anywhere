/**
 * MCP Reverse Proxy
 * Listens on TCP port and forwards to Claude Code's local MCP socket
 * This allows Mac Chrome extension to connect to workspace Claude Code
 */

import * as net from 'net';

export class MCPReverseProxy {
  private server: net.Server | null = null;
  private port = 19223; // TCP port for reverse MCP proxy
  private mcpSocketPath = '';
  private connections = new Set<net.Socket>();

  constructor() {
    const user = process.env.USER || 'kobozo';
    // Claude Code's MCP socket in the workspace
    this.mcpSocketPath = `/tmp/claude-mcp-browser-bridge-${user}`;
  }

  /**
   * Start the reverse proxy server
   */
  async start(): Promise<void> {
    if (this.server) {
      console.log('[MCP Reverse Proxy] Server already running');
      return;
    }

    console.log(`[MCP Reverse Proxy] Starting TCP server on port ${this.port}`);
    console.log(`[MCP Reverse Proxy] Forwarding to local MCP socket: ${this.mcpSocketPath}`);

    this.server = net.createServer((tcpClient) => {
      const clientId = `${tcpClient.remoteAddress}:${tcpClient.remotePort}`;
      console.log(`[MCP Reverse Proxy] Client connected: ${clientId}`);
      this.connections.add(tcpClient);

      // Connect to local MCP socket
      const mcpSocket = net.connect(this.mcpSocketPath);

      mcpSocket.on('connect', () => {
        console.log(`[MCP Reverse Proxy] Connected to local MCP socket`);
      });

      // Pipe data bidirectionally
      tcpClient.on('data', (data) => {
        mcpSocket.write(data);
      });

      mcpSocket.on('data', (data) => {
        tcpClient.write(data);
      });

      // Handle errors and cleanup
      const cleanup = () => {
        this.connections.delete(tcpClient);
        tcpClient.destroy();
        mcpSocket.destroy();
        console.log(`[MCP Reverse Proxy] Client disconnected: ${clientId}`);
      };

      tcpClient.on('error', (err) => {
        console.error(`[MCP Reverse Proxy] TCP client error:`, err.message);
        cleanup();
      });

      mcpSocket.on('error', (err) => {
        console.error(`[MCP Reverse Proxy] MCP socket error:`, err.message);
        if (err.message.includes('ENOENT')) {
          console.error(`[MCP Reverse Proxy] MCP socket not found. Is Claude Code running with --chrome?`);
        }
        cleanup();
      });

      tcpClient.on('end', () => cleanup());
      mcpSocket.on('end', () => cleanup());
    });

    // Listen on all interfaces (allows Tailscale connections)
    return new Promise<void>((resolve, reject) => {
      this.server!.listen(this.port, '0.0.0.0', () => {
        console.log(`[MCP Reverse Proxy] Listening on 0.0.0.0:${this.port}`);
        resolve();
      });

      this.server!.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[MCP Reverse Proxy] Port ${this.port} already in use`);
          resolve(); // Don't treat as fatal
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Stop the reverse proxy server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    // Close all connections
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();

    return new Promise<void>((resolve) => {
      this.server!.close(() => {
        console.log('[MCP Reverse Proxy] Server stopped');
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }
}

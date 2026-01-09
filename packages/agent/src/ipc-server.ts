/**
 * IPC Server for Session Hub Agent
 * Provides local HTTP API over Unix socket for CLI communication
 */

import * as http from 'http';
import * as fs from 'fs';
import type { AgentWebSocket } from './websocket.js';
import type { AgentConfig } from './config.js';

export interface IpcServerConfig {
  workspaceId: string;
  version: string;
  sessionHubUrl: string;
}

export class AgentIpcServer {
  private server: http.Server | null = null;
  private socketPath: string;
  private config: IpcServerConfig;
  private wsClient: AgentWebSocket;

  constructor(config: IpcServerConfig, wsClient: AgentWebSocket) {
    this.config = config;
    this.wsClient = wsClient;
    this.socketPath = `/tmp/session-hub-agent-${config.workspaceId}.sock`;
  }

  /**
   * Start the IPC server
   */
  async start(): Promise<void> {
    // Remove old socket if exists
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch (error) {
        console.warn(`Could not remove old socket at ${this.socketPath}:`, error);
      }
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch(error => {
        console.error('IPC request handler error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      });
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.socketPath, () => {
        // Make socket accessible to the user
        try {
          fs.chmodSync(this.socketPath, 0o666);
        } catch (error) {
          console.warn('Could not chmod socket:', error);
        }
        console.log(`IPC server listening on ${this.socketPath}`);
        resolve();
      });

      this.server!.on('error', (error) => {
        console.error('IPC server error:', error);
        reject(error);
      });
    });
  }

  /**
   * Stop the IPC server
   */
  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          // Clean up socket file
          if (fs.existsSync(this.socketPath)) {
            try {
              fs.unlinkSync(this.socketPath);
            } catch (error) {
              console.warn('Could not remove socket:', error);
            }
          }
          resolve();
        });
      });
    }
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';

    // CORS headers (not strictly necessary for Unix sockets, but good practice)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // Route requests
      if (url === '/env-vars' && method === 'GET') {
        await this.handleGetEnvVars(req, res);
      } else if (url === '/status' && method === 'GET') {
        await this.handleGetStatus(req, res);
      } else if (url === '/refresh-env-vars' && method === 'POST') {
        await this.handleRefreshEnvVars(req, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      console.error('Request handler error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error'
      }));
    }
  }

  /**
   * Handle GET /env-vars - Fetch environment variables from Session Hub server
   */
  private async handleGetEnvVars(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      // Request env vars from Session Hub server via WebSocket
      const envVars = await this.wsClient.requestEnvVars();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(envVars));
    } catch (error) {
      console.error('Failed to get env vars:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to fetch environment variables'
      }));
    }
  }

  /**
   * Handle GET /status - Get agent status
   */
  private async handleGetStatus(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const status = {
      version: this.config.version,
      connected: this.wsClient.isConnected(),
      workspaceId: this.config.workspaceId,
      sessionHubUrl: this.config.sessionHubUrl,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  }

  /**
   * Handle POST /refresh-env-vars - Trigger refresh of environment variables
   */
  private async handleRefreshEnvVars(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      // This would trigger the agent to update /etc/profile.d/
      // For now, just acknowledge the request
      // The actual update is triggered by the server via the reload API

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Environment variable refresh requested'
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'Refresh failed'
      }));
    }
  }
}

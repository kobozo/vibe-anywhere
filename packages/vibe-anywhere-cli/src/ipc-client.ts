/**
 * IPC Client for communicating with Vibe Anywhere Agent
 * Uses Unix socket for local communication
 */

import * as http from 'http';
import * as fs from 'fs';

export interface IpcClientConfig {
  workspaceId?: string;
  socketPath?: string;
}

export interface AgentStatus {
  version: string;
  connected: boolean;
  workspaceId: string;
  sessionHubUrl: string;
}

export class IpcClient {
  private socketPath: string;

  constructor(config: IpcClientConfig = {}) {
    if (config.socketPath) {
      this.socketPath = config.socketPath;
    } else if (config.workspaceId) {
      this.socketPath = `/tmp/vibe-anywhere-agent-${config.workspaceId}.sock`;
    } else {
      // Try to detect workspace ID from environment
      const workspaceId = process.env.WORKSPACE_ID;
      if (!workspaceId) {
        throw new Error('Could not determine workspace ID. Set WORKSPACE_ID environment variable or provide socketPath.');
      }
      this.socketPath = `/tmp/vibe-anywhere-agent-${workspaceId}.sock`;
    }
  }

  /**
   * Check if the agent socket exists
   */
  isAgentRunning(): boolean {
    return fs.existsSync(this.socketPath);
  }

  /**
   * Make HTTP request to the agent over Unix socket
   */
  private async request<T>(method: string, path: string, data?: any): Promise<T> {
    if (!this.isAgentRunning()) {
      throw new Error(`Agent not running. Socket not found at: ${this.socketPath}`);
    }

    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        socketPath: this.socketPath,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk.toString();
        });

        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              const parsed = body ? JSON.parse(body) : {};
              resolve(parsed);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * Get environment variables from the server
   */
  async getEnvVars(): Promise<Record<string, string>> {
    return this.request<Record<string, string>>('GET', '/env-vars');
  }

  /**
   * Get agent status
   */
  async getStatus(): Promise<AgentStatus> {
    return this.request<AgentStatus>('GET', '/status');
  }

  /**
   * Trigger a refresh of environment variables (updates /etc/profile.d/)
   */
  async refreshEnvVars(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('POST', '/refresh-env-vars');
  }
}

/**
 * WebSocket client for connecting to Session Hub
 * Handles authentication, reconnection, and message routing
 */

import { io, Socket } from 'socket.io-client';
import type { AgentConfig } from './config.js';
import { EnvStateManager } from './env-state-manager.js';
import { applyEnvVarChanges } from './env-sync.js';

export interface AgentEvents {
  onConnected: () => void;
  onDisconnected: (reason: string) => void;
  onRegistered: (data: { success: boolean; recoveryMode?: boolean }) => void;
  onUpdateRequested: (data: { version: string; bundleUrl: string }) => void;
  onTabCreate: (data: { tabId: string; command: string[]; name?: string; envVars?: Record<string, string> }) => void;
  onTabInput: (data: { tabId: string; data: string }) => void;
  onTabResize: (data: { tabId: string; cols: number; rows: number }) => void;
  onTabClose: (data: { tabId: string }) => void;
  onTabAttach: (data: { tabId: string }) => void;
  onTabBufferRequest: (data: { tabId: string; lines: number }) => void;
  onFileUpload: (data: { requestId: string; tabId?: string; filename: string; data: string; mimeType: string }) => void;
  onError: (error: Error) => void;
  // Git events
  onGitStatus: (data: { requestId: string }) => void;
  onGitDiff: (data: { requestId: string; staged?: boolean; files?: string[] }) => void;
  onGitStage: (data: { requestId: string; files: string[] }) => void;
  onGitUnstage: (data: { requestId: string; files: string[] }) => void;
  onGitCommit: (data: { requestId: string; message: string }) => void;
  onGitDiscard: (data: { requestId: string; files: string[] }) => void;
  onGitConfig: (data: { requestId: string; name: string; email: string }) => void;
  // Docker events
  onDockerStatus: (data: { requestId: string }) => void;
  onDockerLogs: (data: { requestId: string; containerId: string; tail?: number }) => void;
  onDockerStart: (data: { requestId: string; containerId: string }) => void;
  onDockerStop: (data: { requestId: string; containerId: string }) => void;
  onDockerRestart: (data: { requestId: string; containerId: string }) => void;
  // Stats events
  onStatsRequest: (data: { requestId: string }) => void;
}

export class AgentWebSocket {
  private socket: Socket | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = true;
  private envStateManager: EnvStateManager;

  constructor(
    private config: AgentConfig,
    private events: AgentEvents
  ) {
    // Initialize env state manager
    this.envStateManager = new EnvStateManager(config.workspaceId);
  }

  /**
   * Connect to Session Hub
   */
  connect(): void {
    if (this.socket?.connected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    console.log(`Connecting to Session Hub at ${this.config.sessionHubUrl}...`);

    // Connect to the /agent namespace
    this.socket = io(`${this.config.sessionHubUrl}/agent`, {
      transports: ['websocket'],
      reconnection: false, // We handle reconnection ourselves
      timeout: 10000,
      auth: {
        workspaceId: this.config.workspaceId,
        token: this.config.agentToken,
        version: this.config.version,
      },
    });

    this.setupEventHandlers();
  }

  /**
   * Set up Socket.io event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Connected to Session Hub');
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      // Send registration message
      this.socket!.emit('agent:register', {
        workspaceId: this.config.workspaceId,
        token: this.config.agentToken,
        version: this.config.version,
      });

      this.events.onConnected();
      this.startHeartbeat();
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`Disconnected from Session Hub: ${reason}`);
      this.stopHeartbeat();
      this.events.onDisconnected(reason);

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error.message);
      this.isConnecting = false;
      this.events.onError(error);

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    // Session Hub -> Agent messages
    this.socket.on('agent:registered', async (data) => {
      console.log('Registration confirmed:', data);

      // Load env var state after registration
      try {
        await this.envStateManager.loadState();
      } catch (error) {
        console.error('Failed to load env var state:', error);
        // Continue anyway - non-critical error
      }

      this.events.onRegistered(data);
    });

    this.socket.on('agent:update', (data) => {
      console.log('Update requested:', data);
      this.events.onUpdateRequested(data);
    });

    this.socket.on('tab:create', (data) => {
      this.events.onTabCreate(data);
    });

    this.socket.on('tab:input', (data) => {
      this.events.onTabInput(data);
    });

    this.socket.on('tab:resize', (data) => {
      this.events.onTabResize(data);
    });

    this.socket.on('tab:close', (data) => {
      this.events.onTabClose(data);
    });

    this.socket.on('tab:attach', (data) => {
      this.events.onTabAttach(data);
    });

    this.socket.on('tab:buffer-request', (data) => {
      this.events.onTabBufferRequest(data);
    });

    this.socket.on('file:upload', (data) => {
      this.events.onFileUpload(data);
    });

    // Git events
    this.socket.on('git:status', (data) => {
      this.events.onGitStatus(data);
    });

    this.socket.on('git:diff', (data) => {
      this.events.onGitDiff(data);
    });

    this.socket.on('git:stage', (data) => {
      this.events.onGitStage(data);
    });

    this.socket.on('git:unstage', (data) => {
      this.events.onGitUnstage(data);
    });

    this.socket.on('git:commit', (data) => {
      this.events.onGitCommit(data);
    });

    this.socket.on('git:discard', (data) => {
      this.events.onGitDiscard(data);
    });

    this.socket.on('git:config', (data) => {
      this.events.onGitConfig(data);
    });

    // Docker events
    this.socket.on('docker:status', (data) => {
      this.events.onDockerStatus(data);
    });

    this.socket.on('docker:logs', (data) => {
      this.events.onDockerLogs(data);
    });

    this.socket.on('docker:start', (data) => {
      this.events.onDockerStart(data);
    });

    this.socket.on('docker:stop', (data) => {
      this.events.onDockerStop(data);
    });

    this.socket.on('docker:restart', (data) => {
      this.events.onDockerRestart(data);
    });

    // Stats events
    this.socket.on('stats:request', (data) => {
      this.events.onStatsRequest(data);
    });

    // Environment variable update event
    this.socket.on('env:update', async (data: {
      workspaceId: string;
      repositoryId: string;
      envVars: Record<string, string>;
    }) => {
      try {
        console.log(`Received env:update for workspace ${data.workspaceId}`);

        // Compute diff from current state
        const diff = this.envStateManager.computeDiff(
          data.envVars,
          data.repositoryId
        );

        console.log(`Env var diff: +${Object.keys(diff.toAdd).length} -${diff.toRemove.length} ~${Object.keys(diff.toChange).length}`);

        // Apply changes to system
        await applyEnvVarChanges(data.envVars, diff);

        // Save new state
        await this.envStateManager.saveState(
          data.envVars,
          data.workspaceId,
          data.repositoryId
        );

        // Send success response
        this.socket!.emit('env:update:response', {
          workspaceId: data.workspaceId,
          success: true,
          applied: {
            added: Object.keys(diff.toAdd).length,
            removed: diff.toRemove.length,
            changed: Object.keys(diff.toChange).length,
          }
        });

        console.log(`Env vars updated successfully for workspace ${data.workspaceId}`);
      } catch (error) {
        console.error('Failed to update env vars:', error);

        // Send error response
        this.socket!.emit('env:update:response', {
          workspaceId: data.workspaceId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.events.onError(new Error(typeof error === 'string' ? error : error.message || 'Unknown error'));
    });
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const maxAttempts = this.config.maxReconnectAttempts;
    if (maxAttempts > 0 && this.reconnectAttempts >= maxAttempts) {
      console.error(`Max reconnection attempts (${maxAttempts}) reached. Giving up.`);
      return;
    }

    // Exponential backoff with jitter
    const baseDelay = this.config.reconnectBaseDelay;
    const maxDelay = this.config.reconnectMaxDelay;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempts),
      maxDelay
    );
    const jitter = delay * 0.1 * (Math.random() - 0.5);
    const actualDelay = Math.floor(delay + jitter);

    this.reconnectAttempts++;
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${actualDelay}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, actualDelay);
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send heartbeat with current state
   */
  sendHeartbeat(tabs?: Array<{ tabId: string; status: string }>): void {
    if (!this.socket?.connected) return;

    this.socket.emit('agent:heartbeat', {
      workspaceId: this.config.workspaceId,
      tabs: tabs || [],
      metrics: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().heapUsed,
      },
    });
  }

  /**
   * Send tab output to Session Hub
   */
  sendOutput(tabId: string, data: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('tab:output', { tabId, data });
  }

  /**
   * Notify Session Hub that a tab process ended
   */
  sendTabEnded(tabId: string, exitCode: number): void {
    if (!this.socket?.connected) return;

    this.socket.emit('tab:ended', { tabId, exitCode });
  }

  /**
   * Notify Session Hub that a tab was created
   */
  sendTabCreated(tabId: string, windowIndex: number): void {
    if (!this.socket?.connected) return;

    this.socket.emit('tab:created', { tabId, tmuxWindow: windowIndex });
  }

  /**
   * Send buffered output for a tab
   */
  sendBuffer(tabId: string, lines: string[]): void {
    if (!this.socket?.connected) return;

    this.socket.emit('tab:buffer', { tabId, lines });
  }

  /**
   * Send agent state (for recovery after reconnect)
   */
  sendState(tabs: Array<{ tabId: string; status: string; tmuxWindow: number; hasBuffer: boolean }>): void {
    if (!this.socket?.connected) return;

    this.socket.emit('agent:state', { tabs });
  }

  /**
   * Report an error to Session Hub
   */
  sendError(code: string, message: string, tabId?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('agent:error', { code, message, tabId });
  }

  /**
   * Send file upload result back to Session Hub
   */
  sendFileUploaded(requestId: string, success: boolean, filePath?: string, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('file:uploaded', { requestId, success, filePath, error });
  }

  /**
   * Send git status response
   */
  sendGitStatus(requestId: string, success: boolean, data?: unknown, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('git:status:response', { requestId, success, data, error });
  }

  /**
   * Send git diff response
   */
  sendGitDiff(requestId: string, success: boolean, data?: unknown, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('git:diff:response', { requestId, success, data, error });
  }

  /**
   * Send git stage response
   */
  sendGitStage(requestId: string, success: boolean, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('git:stage:response', { requestId, success, error });
  }

  /**
   * Send git unstage response
   */
  sendGitUnstage(requestId: string, success: boolean, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('git:unstage:response', { requestId, success, error });
  }

  /**
   * Send git commit response
   */
  sendGitCommit(requestId: string, success: boolean, data?: unknown, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('git:commit:response', { requestId, success, data, error });
  }

  /**
   * Send git discard response
   */
  sendGitDiscard(requestId: string, success: boolean, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('git:discard:response', { requestId, success, error });
  }

  /**
   * Send git config response
   */
  sendGitConfig(requestId: string, success: boolean, data?: { name: string; email: string }, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('git:config:response', { requestId, success, data, error });
  }

  /**
   * Send docker status response
   */
  sendDockerStatus(requestId: string, success: boolean, data?: unknown, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('docker:status:response', { requestId, success, data, error });
  }

  /**
   * Send docker logs response
   */
  sendDockerLogs(requestId: string, success: boolean, data?: unknown, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('docker:logs:response', { requestId, success, data, error });
  }

  /**
   * Send docker action response (start/stop/restart)
   */
  sendDockerAction(requestId: string, action: string, success: boolean, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit(`docker:${action}:response`, { requestId, success, error });
  }

  /**
   * Send container stats response
   */
  sendStats(requestId: string, success: boolean, stats?: { cpu: number; memory: { used: number; total: number; percentage: number } }, error?: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('stats:response', { requestId, success, stats, error });
  }

  /**
   * Request environment variables from Session Hub
   * Returns a promise that resolves with the merged env vars
   */
  async requestEnvVars(): Promise<Record<string, string>> {
    if (!this.socket?.connected) {
      throw new Error('Not connected to Session Hub');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Environment variable request timed out'));
      }, 5000);

      // Listen for response
      this.socket!.once('env:response', (data: { envVars: Record<string, string> }) => {
        clearTimeout(timeout);
        resolve(data.envVars);
      });

      // Send request
      this.socket!.emit('env:request', {
        workspaceId: this.config.workspaceId
      });
    });
  }

  /**
   * Disconnect from Session Hub
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

/**
 * WebSocket client for connecting to Session Hub
 * Handles authentication, reconnection, and message routing
 */

import { io, Socket } from 'socket.io-client';
import type { AgentConfig } from './config.js';

export interface AgentEvents {
  onConnected: () => void;
  onDisconnected: (reason: string) => void;
  onRegistered: (data: { success: boolean; recoveryMode?: boolean }) => void;
  onUpdateRequested: (data: { version: string; bundleUrl: string }) => void;
  onTabCreate: (data: { tabId: string; command: string[]; name?: string }) => void;
  onTabInput: (data: { tabId: string; data: string }) => void;
  onTabResize: (data: { tabId: string; cols: number; rows: number }) => void;
  onTabClose: (data: { tabId: string }) => void;
  onTabAttach: (data: { tabId: string }) => void;
  onTabBufferRequest: (data: { tabId: string; lines: number }) => void;
  onError: (error: Error) => void;
}

export class AgentWebSocket {
  private socket: Socket | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = true;

  constructor(
    private config: AgentConfig,
    private events: AgentEvents
  ) {}

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
    this.socket.on('agent:registered', (data) => {
      console.log('Registration confirmed:', data);
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

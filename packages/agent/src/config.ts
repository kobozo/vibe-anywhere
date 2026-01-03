/**
 * Agent configuration from environment variables
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export interface AgentConfig {
  /** Session Hub WebSocket URL (e.g., wss://session-hub.example.com) */
  sessionHubUrl: string;
  /** Workspace ID this agent belongs to */
  workspaceId: string;
  /** Authentication token for this workspace */
  agentToken: string;
  /** Agent version for update checking */
  version: string;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval: number;
  /** Maximum reconnection attempts before giving up (0 = infinite) */
  maxReconnectAttempts: number;
  /** Base reconnection delay in milliseconds */
  reconnectBaseDelay: number;
  /** Maximum reconnection delay in milliseconds */
  reconnectMaxDelay: number;
  /** Output buffer size per tab (number of lines) */
  bufferSize: number;
  /** tmux session name prefix */
  tmuxPrefix: string;
}

export function loadConfig(): AgentConfig {
  return {
    sessionHubUrl: requireEnv('SESSION_HUB_URL'),
    workspaceId: requireEnv('WORKSPACE_ID'),
    agentToken: requireEnv('AGENT_TOKEN'),
    version: optionalEnv('AGENT_VERSION', '1.0.0'),
    heartbeatInterval: parseInt(optionalEnv('HEARTBEAT_INTERVAL', '30000'), 10),
    maxReconnectAttempts: parseInt(optionalEnv('MAX_RECONNECT_ATTEMPTS', '0'), 10),
    reconnectBaseDelay: parseInt(optionalEnv('RECONNECT_BASE_DELAY', '1000'), 10),
    reconnectMaxDelay: parseInt(optionalEnv('RECONNECT_MAX_DELAY', '60000'), 10),
    bufferSize: parseInt(optionalEnv('BUFFER_SIZE', '10000'), 10),
    tmuxPrefix: optionalEnv('TMUX_PREFIX', 'sh_'),
  };
}

export const config = loadConfig();

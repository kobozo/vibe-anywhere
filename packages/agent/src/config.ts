/**
 * Agent configuration from environment variables
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get version from package.json
function getPackageVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Look for package.json in parent directory (dist/../package.json)
    const packagePath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return packageJson.version || '1.0.0';
  } catch (error) {
    console.warn('Could not read version from package.json, using default');
    return '1.0.0';
  }
}

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
    version: getPackageVersion(),
    heartbeatInterval: parseInt(optionalEnv('HEARTBEAT_INTERVAL', '30000'), 10),
    maxReconnectAttempts: parseInt(optionalEnv('MAX_RECONNECT_ATTEMPTS', '0'), 10),
    reconnectBaseDelay: parseInt(optionalEnv('RECONNECT_BASE_DELAY', '1000'), 10),
    reconnectMaxDelay: parseInt(optionalEnv('RECONNECT_MAX_DELAY', '300000'), 10),
    bufferSize: parseInt(optionalEnv('BUFFER_SIZE', '10000'), 10),
    tmuxPrefix: optionalEnv('TMUX_PREFIX', 'sh_'),
  };
}

export const config = loadConfig();

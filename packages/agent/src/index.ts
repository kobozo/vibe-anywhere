/**
 * Session Hub Sidecar Agent
 * Main entry point
 */

import { config } from './config.js';
import { AgentWebSocket } from './websocket.js';
import { TmuxManager } from './tmux-manager.js';
import { OutputBufferManager } from './output-buffer.js';
import { selfUpdate } from './updater.js';

// Handle --version flag
if (process.argv.includes('--version')) {
  console.log(config.version);
  process.exit(0);
}

console.log(`Session Hub Agent v${config.version}`);
console.log(`Workspace ID: ${config.workspaceId}`);
console.log(`Session Hub URL: ${config.sessionHubUrl}`);

// Initialize components
const bufferManager = new OutputBufferManager(config.bufferSize);

const tmuxManager = new TmuxManager(
  config.workspaceId,
  config.tmuxPrefix,
  {
    onOutput: (tabId, data) => {
      // Buffer locally
      bufferManager.append(tabId, data);
      // Send to Session Hub
      wsClient.sendOutput(tabId, data);
    },
    onExit: (tabId, exitCode) => {
      console.log(`Tab ${tabId} exited with code ${exitCode}`);
      wsClient.sendTabEnded(tabId, exitCode);
    },
    onError: (tabId, error) => {
      console.error(`Tab ${tabId} error:`, error);
      wsClient.sendError('TAB_ERROR', error.message, tabId);
    },
  }
);

const wsClient = new AgentWebSocket(config, {
  onConnected: async () => {
    console.log('Connected to Session Hub');

    // Initialize tmux if not already done
    try {
      await tmuxManager.initialize();
    } catch (error) {
      console.error('Failed to initialize tmux:', error);
    }
  },

  onDisconnected: (reason) => {
    console.log(`Disconnected: ${reason}`);
  },

  onRegistered: async (data) => {
    console.log('Registration confirmed:', data);

    if (data.recoveryMode) {
      // Send current state to Session Hub
      const windows = tmuxManager.getWindowStatus();
      wsClient.sendState(
        windows.map(w => ({
          tabId: w.tabId,
          status: w.isEnded ? 'stopped' : 'running',
          tmuxWindow: w.windowIndex,
          hasBuffer: bufferManager.has(w.tabId),
        }))
      );
    }
  },

  onUpdateRequested: async (data) => {
    console.log(`Update requested to version ${data.version}`);
    const result = await selfUpdate(data.bundleUrl, data.version);
    if (!result.success) {
      wsClient.sendError('UPDATE_FAILED', result.error || 'Unknown error');
    }
    // On success, process exits and systemd restarts with new version
  },

  onTabCreate: async (data) => {
    console.log(`Creating tab ${data.tabId} with command:`, data.command);
    try {
      const windowIndex = await tmuxManager.createWindow(data.tabId, data.command);
      wsClient.sendTabCreated(data.tabId, windowIndex);
    } catch (error) {
      console.error('Failed to create tab:', error);
      wsClient.sendError('TAB_CREATE_FAILED', error instanceof Error ? error.message : String(error), data.tabId);
    }
  },

  onTabInput: (data) => {
    const sent = tmuxManager.sendInput(data.tabId, data.data);
    if (!sent) {
      console.warn(`Failed to send input to tab ${data.tabId} - window not found or ended`);
    }
  },

  onTabResize: (data) => {
    tmuxManager.resize(data.tabId, data.cols, data.rows);
  },

  onTabClose: async (data) => {
    console.log(`Closing tab ${data.tabId}`);
    await tmuxManager.closeWindow(data.tabId);
    bufferManager.clear(data.tabId);
  },

  onTabAttach: async (data) => {
    console.log(`Tab attach request for ${data.tabId}`);
    // This is a reconnect - the window should already exist
    if (tmuxManager.hasActiveWindow(data.tabId)) {
      // Send buffered output
      const lines = bufferManager.getAll(data.tabId);
      if (lines.length > 0) {
        wsClient.sendBuffer(data.tabId, lines);
      }
    }
  },

  onTabBufferRequest: (data) => {
    const lines = bufferManager.getRecent(data.tabId, data.lines);
    wsClient.sendBuffer(data.tabId, lines);
  },

  onError: (error) => {
    console.error('WebSocket error:', error);
  },
});

// Start connection
wsClient.connect();

// Heartbeat with tab status
setInterval(() => {
  const windows = tmuxManager.getWindowStatus();
  wsClient.sendHeartbeat(
    windows.map(w => ({
      tabId: w.tabId,
      status: w.isEnded ? 'stopped' : 'running',
    }))
  );
}, config.heartbeatInterval);

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down...`);

  wsClient.disconnect();

  // Don't cleanup tmux - let it persist for reconnection
  // await tmuxManager.cleanup();

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Keep process alive
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Don't exit - try to keep running
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  // Don't exit - try to keep running
});

console.log('Agent started, connecting to Session Hub...');

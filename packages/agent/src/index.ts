/**
 * Session Hub Sidecar Agent
 * Main entry point
 */

import { config } from './config.js';
import { AgentWebSocket } from './websocket.js';
import { TmuxManager } from './tmux-manager.js';
import { OutputBufferManager } from './output-buffer.js';
import { selfUpdate } from './updater.js';
import { GitHandler } from './git-handler.js';
import { DockerHandler } from './docker-handler.js';
import { StatsHandler } from './stats-handler.js';
import * as fs from 'fs';
import * as path from 'path';

// Directory for clipboard-pasted files (images, etc.)
// Use workspace directory so Claude Code can access the files
const CLIPBOARD_DIR = '/workspace/.images';

// Ensure clipboard upload directory exists
try {
  fs.mkdirSync(CLIPBOARD_DIR, { recursive: true });
} catch {
  console.warn(`Could not create clipboard directory: ${CLIPBOARD_DIR}`);
}

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
const gitHandler = new GitHandler('/workspace');
const dockerHandler = new DockerHandler();
const statsHandler = new StatsHandler();

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
    if (data.envVars && Object.keys(data.envVars).length > 0) {
      console.log(`  with ${Object.keys(data.envVars).length} environment variables`);
    }
    try {
      const windowIndex = await tmuxManager.createWindow(data.tabId, data.command, data.envVars);
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
      // Capture scrollback from tmux (the real terminal history)
      const lines = await tmuxManager.captureScrollback(data.tabId, 1000);
      if (lines.length > 0) {
        console.log(`Sending ${lines.length} lines of scrollback for ${data.tabId}`);
        wsClient.sendBuffer(data.tabId, lines);
      }
    }
  },

  onTabBufferRequest: async (data) => {
    // Use tmux capture-pane to get real scrollback buffer
    const lines = await tmuxManager.captureScrollback(data.tabId, data.lines);
    console.log(`Buffer request for ${data.tabId}: sending ${lines.length} lines`);
    wsClient.sendBuffer(data.tabId, lines);
  },

  onFileUpload: async (data) => {
    console.log(`File upload request: ${data.filename} (${data.mimeType}) for tab ${data.tabId}`);
    try {
      // Decode base64 data
      const buffer = Buffer.from(data.data, 'base64');

      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const ext = path.extname(data.filename) || getExtFromMimeType(data.mimeType);
      const safeFilename = `clipboard-${timestamp}${ext}`;
      const filePath = path.join(CLIPBOARD_DIR, safeFilename);

      // Write file
      fs.writeFileSync(filePath, buffer);
      console.log(`File saved: ${filePath} (${buffer.length} bytes)`);

      // Send inline image preview via iTerm2 IIP escape sequence
      // This will be rendered by xterm.js ImageAddon in the browser
      if (data.tabId && data.mimeType.startsWith('image/')) {
        const iipEscape = `\x1b]1337;File=inline=1:${data.data}\x07`;
        wsClient.sendOutput(data.tabId, iipEscape);
      }

      // Use tmux send-keys to type the file path at cursor position
      // This allows the user to add context before/after the path
      const hasWindow = data.tabId && tmuxManager.hasActiveWindow(data.tabId);
      console.log(`[file:upload] tabId=${data.tabId}, hasActiveWindow=${hasWindow}`);

      if (hasWindow) {
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          // Get the window index for this tab
          const windows = tmuxManager.getWindowStatus();
          console.log(`[file:upload] Windows: ${JSON.stringify(windows)}`);
          const window = windows.find(w => w.tabId === data.tabId);
          if (window) {
            // Type the file path using send-keys -l (literal mode)
            const sessionName = `sh-${config.workspaceId}`;
            const cmd = `tmux send-keys -t ${sessionName}:${window.windowIndex} -l '${filePath}'`;
            console.log(`[file:upload] Executing: ${cmd}`);
            await execAsync(cmd);
            console.log(`Typed file path via tmux into window ${window.windowIndex}`);
          } else {
            console.log(`[file:upload] No window found for tabId ${data.tabId}`);
          }
        } catch (tmuxError) {
          console.warn('Failed to type path via tmux, path saved to file:', tmuxError);
        }
      } else {
        console.log(`[file:upload] Skipping send-keys: no active window for tabId ${data.tabId}`);
      }

      wsClient.sendFileUploaded(data.requestId, true, filePath);
    } catch (error) {
      console.error('File upload failed:', error);
      wsClient.sendFileUploaded(
        data.requestId,
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  // Git event handlers
  onGitStatus: async (data) => {
    console.log(`Git status request: ${data.requestId}`);
    try {
      const status = await gitHandler.getStatus();
      wsClient.sendGitStatus(data.requestId, true, status);
    } catch (error) {
      console.error('Git status failed:', error);
      wsClient.sendGitStatus(
        data.requestId,
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  onGitDiff: async (data) => {
    console.log(`Git diff request: ${data.requestId}, staged: ${data.staged}`);
    try {
      const diff = await gitHandler.getDiff({ staged: data.staged, files: data.files });
      wsClient.sendGitDiff(data.requestId, true, diff);
    } catch (error) {
      console.error('Git diff failed:', error);
      wsClient.sendGitDiff(
        data.requestId,
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  onGitStage: async (data) => {
    console.log(`Git stage request: ${data.requestId}, files: ${data.files.length}`);
    try {
      await gitHandler.stageFiles(data.files);
      wsClient.sendGitStage(data.requestId, true);
    } catch (error) {
      console.error('Git stage failed:', error);
      wsClient.sendGitStage(
        data.requestId,
        false,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  onGitUnstage: async (data) => {
    console.log(`Git unstage request: ${data.requestId}, files: ${data.files.length}`);
    try {
      await gitHandler.unstageFiles(data.files);
      wsClient.sendGitUnstage(data.requestId, true);
    } catch (error) {
      console.error('Git unstage failed:', error);
      wsClient.sendGitUnstage(
        data.requestId,
        false,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  onGitCommit: async (data) => {
    console.log(`Git commit request: ${data.requestId}`);
    try {
      const result = await gitHandler.commit(data.message);
      wsClient.sendGitCommit(data.requestId, true, result);
    } catch (error) {
      console.error('Git commit failed:', error);
      wsClient.sendGitCommit(
        data.requestId,
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  onGitDiscard: async (data) => {
    console.log(`Git discard request: ${data.requestId}, files: ${data.files.length}`);
    try {
      await gitHandler.discardChanges(data.files);
      wsClient.sendGitDiscard(data.requestId, true);
    } catch (error) {
      console.error('Git discard failed:', error);
      wsClient.sendGitDiscard(
        data.requestId,
        false,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  onGitConfig: async (data) => {
    console.log(`Git config request: ${data.requestId}, name: ${data.name}, email: ${data.email}`);
    try {
      const result = await gitHandler.setConfig(data.name, data.email);
      wsClient.sendGitConfig(data.requestId, true, result);
    } catch (error) {
      console.error('Git config failed:', error);
      wsClient.sendGitConfig(
        data.requestId,
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  // Docker event handlers
  onDockerStatus: async (data) => {
    console.log(`Docker status request: ${data.requestId}`);
    try {
      const status = await dockerHandler.getContainers();
      wsClient.sendDockerStatus(data.requestId, true, status);
    } catch (error) {
      console.error('Docker status failed:', error);
      wsClient.sendDockerStatus(
        data.requestId,
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  onDockerLogs: async (data) => {
    console.log(`Docker logs request: ${data.requestId}, container: ${data.containerId}`);
    try {
      const logs = await dockerHandler.getLogs(data.containerId, data.tail);
      wsClient.sendDockerLogs(data.requestId, true, { containerId: data.containerId, logs });
    } catch (error) {
      console.error('Docker logs failed:', error);
      wsClient.sendDockerLogs(
        data.requestId,
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  onDockerStart: async (data) => {
    console.log(`Docker start request: ${data.requestId}, container: ${data.containerId}`);
    try {
      await dockerHandler.startContainer(data.containerId);
      wsClient.sendDockerAction(data.requestId, 'start', true);
    } catch (error) {
      console.error('Docker start failed:', error);
      wsClient.sendDockerAction(
        data.requestId,
        'start',
        false,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  onDockerStop: async (data) => {
    console.log(`Docker stop request: ${data.requestId}, container: ${data.containerId}`);
    try {
      await dockerHandler.stopContainer(data.containerId);
      wsClient.sendDockerAction(data.requestId, 'stop', true);
    } catch (error) {
      console.error('Docker stop failed:', error);
      wsClient.sendDockerAction(
        data.requestId,
        'stop',
        false,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  onDockerRestart: async (data) => {
    console.log(`Docker restart request: ${data.requestId}, container: ${data.containerId}`);
    try {
      await dockerHandler.restartContainer(data.containerId);
      wsClient.sendDockerAction(data.requestId, 'restart', true);
    } catch (error) {
      console.error('Docker restart failed:', error);
      wsClient.sendDockerAction(
        data.requestId,
        'restart',
        false,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  // Stats event handler
  onStatsRequest: async (data) => {
    try {
      const stats = await statsHandler.getStats();
      wsClient.sendStats(data.requestId, true, stats);
    } catch (error) {
      console.error('Stats request failed:', error);
      wsClient.sendStats(
        data.requestId,
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  },

  onError: (error) => {
    console.error('WebSocket error:', error);
  },
});

/**
 * Get file extension from MIME type
 */
function getExtFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
  };
  return mimeToExt[mimeType] || '.bin';
}

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

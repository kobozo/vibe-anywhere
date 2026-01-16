import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import {
  getAuthService,
  getTabService,
  getWorkspaceService,
  getRepositoryService,
  getContainerBackendAsync,
  getAgentRegistry,
  // Legacy support
  getSessionService,
} from '@/lib/services';
import { getTabStreamManager } from '@/lib/services/tab-stream-manager';
import { getWorkspaceStateBroadcaster } from '@/lib/services/workspace-state-broadcaster';
import { getTemplateService } from '@/lib/services';
import { createSSHStream } from '@/lib/container/proxmox/ssh-stream';
import type { ContainerStream } from '@/lib/container';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  tabId?: string;
  sessionId?: string; // Legacy support
  containerStream?: ContainerStream; // Legacy support only
  stagingTemplateId?: string; // For staging terminal connections
  stagingStream?: ContainerStream; // SSH stream for staging terminal
}

// Extend globalThis type to include our socket server
declare global {
  // eslint-disable-next-line no-var
  var __socketServerInstance: SocketServer | undefined;
}

/**
 * Get the Socket.io server instance
 * Uses globalThis to ensure it's shared across all Next.js execution contexts
 */
export function getSocketServer(): SocketServer | null {
  return globalThis.__socketServerInstance || null;
}

// Track pending file uploads for relay between browser and agent
interface PendingUpload {
  socket: AuthenticatedSocket;
  timeoutId: NodeJS.Timeout;
}
const pendingUploads: Map<string, PendingUpload> = new Map();

// Track pending git operations for relay between browser and agent
interface PendingGitOperation {
  socket: AuthenticatedSocket;
  timeoutId: NodeJS.Timeout;
}
const pendingGitOperations: Map<string, PendingGitOperation> = new Map();

// Track pending docker operations for relay between browser and agent
interface PendingDockerOperation {
  socket: AuthenticatedSocket;
  timeoutId: NodeJS.Timeout;
}
const pendingDockerOperations: Map<string, PendingDockerOperation> = new Map();

// Track pending stats operations for relay between browser and agent
interface PendingStatsOperation {
  socket: AuthenticatedSocket;
  timeoutId: NodeJS.Timeout;
}
const pendingStatsOperations: Map<string, PendingStatsOperation> = new Map();

// Track pending Tailscale operations for relay between browser and agent
interface PendingTailscaleOperation {
  socket: AuthenticatedSocket;
  timeoutId: NodeJS.Timeout;
}
const pendingTailscaleOperations: Map<string, PendingTailscaleOperation> = new Map();

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'development' ? '*' : false,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Store globally for access from any context (API routes, services, etc.)
  globalThis.__socketServerInstance = io;

  // Initialize workspace state broadcaster
  const workspaceStateBroadcaster = getWorkspaceStateBroadcaster();
  workspaceStateBroadcaster.initialize(io);

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token as string;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const authService = getAuthService();
      const user = await authService.validateToken(token);

      if (!user) {
        return next(new Error('Invalid token'));
      }

      socket.userId = user.id;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    // Debug only: console.log(`Client connected: ${socket.id}`);

    const tabStreamManager = getTabStreamManager();

    // Handle tab attachment (new v2 API with persistent streams)
    socket.on('tab:attach', async (data: { tabId: string }) => {
      try {
        await handleTabAttach(socket, data.tabId);
      } catch (error) {
        console.error(`Tab attach error [${data.tabId}]:`, error instanceof Error ? error.message : error);
        socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to attach to tab' });
      }
    });

    // Handle session attachment (legacy support)
    socket.on('session:attach', async (data: { sessionId: string }) => {
      try {
        await handleSessionAttach(socket, data.sessionId);
      } catch (error) {
        console.error('Error attaching to session:', error);
        socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to attach to session' });
      }
    });

    // Handle staging template terminal attachment
    socket.on('staging:attach', async (data: { templateId: string }) => {
      try {
        await handleStagingAttach(socket, data.templateId);
      } catch (error) {
        console.error('Error attaching to staging template:', error);
        socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to attach to staging terminal' });
      }
    });

    // Handle terminal input
    socket.on('terminal:input', (data: { data: string }) => {
      // Try v2 tab stream manager first
      if (socket.tabId) {
        const sent = tabStreamManager.sendInput(socket.tabId, data.data);
        if (sent) return;
      }

      // Try staging terminal stream
      if (socket.stagingStream) {
        socket.stagingStream.stream.write(data.data);
        return;
      }

      // Fall back to legacy socket-attached stream
      if (socket.containerStream) {
        socket.containerStream.stream.write(data.data);
      }
    });

    // Handle terminal resize
    socket.on('terminal:resize', async (data: { cols: number; rows: number }) => {
      try {
        // Try v2 tab stream manager first
        if (socket.tabId) {
          await tabStreamManager.resize(socket.tabId, data.cols, data.rows);
          return;
        }

        // Try staging terminal stream
        if (socket.stagingStream) {
          await socket.stagingStream.resize(data.cols, data.rows);
          return;
        }

        // Fall back to legacy session - use the socket's attached container stream
        if (socket.containerStream) {
          await socket.containerStream.resize(data.cols, data.rows);
        }
      } catch (error) {
        console.error('Error resizing terminal:', error);
      }
    });

    // Handle git operations from browser
    socket.on('git:status', async (data: { requestId: string; workspaceId: string }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('git:status:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingGitOperations.delete(data.requestId);
        }, 30000);

        pendingGitOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.gitStatus(data.workspaceId, data.requestId);
        if (!sent) {
          clearTimeout(timeout);
          pendingGitOperations.delete(data.requestId);
          socket.emit('git:status:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('git:status:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Git status failed',
        });
      }
    });

    socket.on('git:diff', async (data: { requestId: string; workspaceId: string; staged?: boolean; files?: string[] }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('git:diff:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingGitOperations.delete(data.requestId);
        }, 30000);

        pendingGitOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.gitDiff(data.workspaceId, data.requestId, { staged: data.staged, files: data.files });
        if (!sent) {
          clearTimeout(timeout);
          pendingGitOperations.delete(data.requestId);
          socket.emit('git:diff:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('git:diff:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Git diff failed',
        });
      }
    });

    socket.on('git:stage', async (data: { requestId: string; workspaceId: string; files: string[] }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('git:stage:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingGitOperations.delete(data.requestId);
        }, 30000);

        pendingGitOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.gitStage(data.workspaceId, data.requestId, data.files);
        if (!sent) {
          clearTimeout(timeout);
          pendingGitOperations.delete(data.requestId);
          socket.emit('git:stage:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('git:stage:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Git stage failed',
        });
      }
    });

    socket.on('git:unstage', async (data: { requestId: string; workspaceId: string; files: string[] }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('git:unstage:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingGitOperations.delete(data.requestId);
        }, 30000);

        pendingGitOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.gitUnstage(data.workspaceId, data.requestId, data.files);
        if (!sent) {
          clearTimeout(timeout);
          pendingGitOperations.delete(data.requestId);
          socket.emit('git:unstage:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('git:unstage:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Git unstage failed',
        });
      }
    });

    socket.on('git:commit', async (data: { requestId: string; workspaceId: string; message: string }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('git:commit:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingGitOperations.delete(data.requestId);
        }, 30000);

        pendingGitOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.gitCommit(data.workspaceId, data.requestId, data.message);
        if (!sent) {
          clearTimeout(timeout);
          pendingGitOperations.delete(data.requestId);
          socket.emit('git:commit:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('git:commit:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Git commit failed',
        });
      }
    });

    socket.on('git:discard', async (data: { requestId: string; workspaceId: string; files: string[] }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('git:discard:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingGitOperations.delete(data.requestId);
        }, 30000);

        pendingGitOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.gitDiscard(data.workspaceId, data.requestId, data.files);
        if (!sent) {
          clearTimeout(timeout);
          pendingGitOperations.delete(data.requestId);
          socket.emit('git:discard:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('git:discard:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Git discard failed',
        });
      }
    });

    // Docker: Get container status
    socket.on('docker:status', async (data: { requestId: string; workspaceId: string }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('docker:status:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingDockerOperations.delete(data.requestId);
        }, 30000);

        pendingDockerOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.dockerStatus(data.workspaceId, data.requestId);
        if (!sent) {
          clearTimeout(timeout);
          pendingDockerOperations.delete(data.requestId);
          socket.emit('docker:status:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('docker:status:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Docker status failed',
        });
      }
    });

    // Docker: Get container logs
    socket.on('docker:logs', async (data: { requestId: string; workspaceId: string; containerId: string; tail?: number }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('docker:logs:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingDockerOperations.delete(data.requestId);
        }, 30000);

        pendingDockerOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.dockerLogs(data.workspaceId, data.requestId, data.containerId, data.tail);
        if (!sent) {
          clearTimeout(timeout);
          pendingDockerOperations.delete(data.requestId);
          socket.emit('docker:logs:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('docker:logs:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Docker logs failed',
        });
      }
    });

    // Docker: Start container
    socket.on('docker:start', async (data: { requestId: string; workspaceId: string; containerId: string }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('docker:start:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingDockerOperations.delete(data.requestId);
        }, 30000);

        pendingDockerOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.dockerStart(data.workspaceId, data.requestId, data.containerId);
        if (!sent) {
          clearTimeout(timeout);
          pendingDockerOperations.delete(data.requestId);
          socket.emit('docker:start:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('docker:start:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Docker start failed',
        });
      }
    });

    // Docker: Stop container
    socket.on('docker:stop', async (data: { requestId: string; workspaceId: string; containerId: string }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('docker:stop:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingDockerOperations.delete(data.requestId);
        }, 30000);

        pendingDockerOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.dockerStop(data.workspaceId, data.requestId, data.containerId);
        if (!sent) {
          clearTimeout(timeout);
          pendingDockerOperations.delete(data.requestId);
          socket.emit('docker:stop:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('docker:stop:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Docker stop failed',
        });
      }
    });

    // Docker: Restart container
    socket.on('docker:restart', async (data: { requestId: string; workspaceId: string; containerId: string }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('docker:restart:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingDockerOperations.delete(data.requestId);
        }, 30000);

        pendingDockerOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.dockerRestart(data.workspaceId, data.requestId, data.containerId);
        if (!sent) {
          clearTimeout(timeout);
          pendingDockerOperations.delete(data.requestId);
          socket.emit('docker:restart:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('docker:restart:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Docker restart failed',
        });
      }
    });

    // Container stats: Get CPU and memory usage
    socket.on('stats:request', async (data: { requestId: string; workspaceId: string }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('stats:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingStatsOperations.delete(data.requestId);
        }, 10000);

        pendingStatsOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.requestStats(data.workspaceId, data.requestId);
        if (!sent) {
          clearTimeout(timeout);
          pendingStatsOperations.delete(data.requestId);
          socket.emit('stats:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('stats:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Stats request failed',
        });
      }
    });

    // Tailscale operations from browser
    socket.on('tailscale:status', async (data: { requestId: string; workspaceId: string }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('tailscale:status:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingTailscaleOperations.delete(data.requestId);
        }, 30000); // 30 second timeout

        pendingTailscaleOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.tailscaleStatus(data.workspaceId, data.requestId);
        if (!sent) {
          clearTimeout(timeout);
          pendingTailscaleOperations.delete(data.requestId);
          socket.emit('tailscale:status:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('tailscale:status:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Tailscale status failed',
        });
      }
    });

    socket.on('tailscale:connect', async (data: { requestId: string; workspaceId: string; authKey: string }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('tailscale:connect:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingTailscaleOperations.delete(data.requestId);
        }, 30000); // 30 second timeout

        pendingTailscaleOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.tailscaleConnect(data.workspaceId, data.requestId, data.authKey);
        if (!sent) {
          clearTimeout(timeout);
          pendingTailscaleOperations.delete(data.requestId);
          socket.emit('tailscale:connect:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('tailscale:connect:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Tailscale connect failed',
        });
      }
    });

    socket.on('tailscale:disconnect', async (data: { requestId: string; workspaceId: string }) => {
      try {
        const agentRegistry = getAgentRegistry();
        const timeout = setTimeout(() => {
          socket.emit('tailscale:disconnect:response', { requestId: data.requestId, success: false, error: 'Operation timeout' });
          pendingTailscaleOperations.delete(data.requestId);
        }, 30000); // 30 second timeout

        pendingTailscaleOperations.set(data.requestId, { socket, timeoutId: timeout });

        const sent = agentRegistry.tailscaleDisconnect(data.workspaceId, data.requestId);
        if (!sent) {
          clearTimeout(timeout);
          pendingTailscaleOperations.delete(data.requestId);
          socket.emit('tailscale:disconnect:response', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        socket.emit('tailscale:disconnect:response', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Tailscale disconnect failed',
        });
      }
    });

    // Handle file upload (for clipboard image paste)
    socket.on('file:upload', async (data: { requestId: string; filename: string; data: string; mimeType: string }) => {
      try {
        if (!socket.tabId) {
          socket.emit('file:uploaded', { requestId: data.requestId, success: false, error: 'No tab attached' });
          return;
        }

        // Get the workspace for this tab
        const tabService = getTabService();
        const tab = await tabService.getTab(socket.tabId);
        if (!tab) {
          socket.emit('file:uploaded', { requestId: data.requestId, success: false, error: 'Tab not found' });
          return;
        }

        const agentRegistry = getAgentRegistry();

        // Store pending upload callback
        const timeoutId = setTimeout(() => {
          socket.emit('file:uploaded', { requestId: data.requestId, success: false, error: 'Upload timeout' });
          pendingUploads.delete(data.requestId);
        }, 30000);

        pendingUploads.set(data.requestId, {
          socket,
          timeoutId,
        });

        // Send to agent with tabId for tmux native paste
        const sent = agentRegistry.uploadFile(tab.workspaceId, data.requestId, socket.tabId, data.filename, data.data, data.mimeType);
        if (!sent) {
          clearTimeout(timeoutId);
          pendingUploads.delete(data.requestId);
          socket.emit('file:uploaded', { requestId: data.requestId, success: false, error: 'Agent not connected' });
        }
      } catch (error) {
        console.error('File upload error:', error);
        socket.emit('file:uploaded', {
          requestId: data.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    });

    // Handle disconnect - DON'T close streams, just detach
    socket.on('disconnect', () => {

      // Detach from all tab streams (keeps streams running)
      tabStreamManager.detachFromAll(socket);

      // Close staging terminal stream
      if (socket.stagingStream) {
        socket.stagingStream.close().catch(console.error);
      }

      // Legacy: close socket-attached stream
      if (socket.containerStream) {
        socket.containerStream.close().catch(console.error);
      }
    });
  });

  // Set up agent namespace for sidecar agents
  setupAgentNamespace(io);

  return io;
}

/**
 * Agent socket interface
 */
interface AgentSocket extends Socket {
  workspaceId?: string;
  agentVersion?: string;
}

// Track failed registration attempts to avoid log spam
const failedRegistrations = new Map<string, { count: number; lastLog: number }>();
const FAILED_LOG_INTERVAL = 60000; // Log at most once per minute per workspace

/**
 * Set up the /agent namespace for sidecar agents
 */
function setupAgentNamespace(io: SocketServer): void {
  const agentNs = io.of('/agent');
  const agentRegistry = getAgentRegistry();
  const tabStreamManager = getTabStreamManager();

  agentNs.on('connection', (socket: AgentSocket) => {
    // Handle agent registration
    socket.on('agent:register', async (data: { workspaceId: string; token: string; version: string }) => {
      try {
        const result = await agentRegistry.register(socket, data.workspaceId, data.token, data.version);

        if (!result.success) {
          // Rate-limit failed registration logs
          const now = Date.now();
          const tracker = failedRegistrations.get(data.workspaceId);
          if (!tracker || now - tracker.lastLog > FAILED_LOG_INTERVAL) {
            const count = tracker ? tracker.count + 1 : 1;
            console.log(`Agent registration failed for workspace ${data.workspaceId}: ${result.error} (${count} attempts)`);
            failedRegistrations.set(data.workspaceId, { count, lastLog: now });
          } else {
            tracker.count++;
          }
          socket.emit('agent:registered', { success: false, error: result.error });
          socket.disconnect(true);
          return;
        }

        // Clear failed registration tracker on success
        failedRegistrations.delete(data.workspaceId);
        console.log(`Agent registered for workspace ${data.workspaceId} (v${data.version})`);

        socket.workspaceId = data.workspaceId;
        socket.agentVersion = data.version;

        socket.emit('agent:registered', {
          success: true,
          recoveryMode: result.needsUpdate === false, // Only recovery if not updating
        });

        // If agent needs update, send update request
        if (result.needsUpdate) {
          const bundleUrl = `${process.env.SESSION_HUB_URL || 'http://localhost:3000'}/api/agent/bundle`;
          agentRegistry.requestUpdate(data.workspaceId, bundleUrl);
        }
      } catch (error) {
        console.error('Agent registration error:', error);
        socket.emit('agent:registered', {
          success: false,
          error: error instanceof Error ? error.message : 'Registration failed',
        });
        socket.disconnect(true);
      }
    });

    // Handle agent heartbeat
    socket.on('agent:heartbeat', async (data: {
      workspaceId: string;
      tabs: Array<{ tabId: string; status: string }>;
      tailscaleStatus?: { online: boolean; tailscaleIP: string | null; hostname: string | null; tailnet: string | null; peerCount: number; version: string | null; exitNode: string | null } | null;
      chromeStatus?: { connected: boolean; chromeHost: string | null; lastActivity: string } | null;
      metrics?: unknown
    }) => {
      if (socket.workspaceId && socket.workspaceId === data.workspaceId) {
        await agentRegistry.heartbeat(data.workspaceId, data.tabs, data.tailscaleStatus, data.chromeStatus);
      }
    });

    // Handle agent state report (after reconnection)
    socket.on('agent:state', (data: { tabs: Array<{ tabId: string; status: string; tmuxWindow: number; hasBuffer: boolean }> }) => {
      if (!socket.workspaceId) return;

      for (const tab of data.tabs) {
        agentRegistry.updateTabState(socket.workspaceId, tab.tabId, tab.tmuxWindow, tab.status as 'running' | 'stopped');
      }
    });

    // Handle tab output from agent
    socket.on('tab:output', (data: { tabId: string; data: string }) => {
      // Forward to all browser clients attached to this tab
      tabStreamManager.broadcastOutput(data.tabId, data.data);
    });

    // Handle tab created confirmation
    socket.on('tab:created', (data: { tabId: string; tmuxWindow: number }) => {
      if (socket.workspaceId) {
        agentRegistry.updateTabState(socket.workspaceId, data.tabId, data.tmuxWindow, 'running');
        tabStreamManager.notifyTabCreated(data.tabId);
      }
    });

    // Handle tab ended
    socket.on('tab:ended', async (data: { tabId: string; exitCode: number }) => {
      if (socket.workspaceId) {
        agentRegistry.updateTabState(socket.workspaceId, data.tabId, 0, 'stopped');
        await tabStreamManager.notifyTabEnded(data.tabId, data.exitCode);
      }
    });

    // Handle buffer response from agent
    socket.on('tab:buffer', (data: { tabId: string; lines: string[] }) => {
      tabStreamManager.sendBuffer(data.tabId, data.lines);
    });

    // Handle agent errors
    socket.on('agent:error', (data: { code: string; message: string; tabId?: string }) => {
      console.error(`Agent error from ${socket.workspaceId}: [${data.code}] ${data.message}`);
      if (data.tabId) {
        tabStreamManager.notifyError(data.tabId, data.message);
      }
    });

    // Handle file uploaded response from agent (relay back to browser)
    socket.on('file:uploaded', (data: { requestId: string; success: boolean; filePath?: string; error?: string }) => {
      const pending = pendingUploads.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('file:uploaded', data);
        pendingUploads.delete(data.requestId);
      }
    });

    // Handle git response from agent (relay back to browser)
    socket.on('git:status:response', (data: { requestId: string; success: boolean; data?: unknown; error?: string }) => {
      const pending = pendingGitOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('git:status:response', data);
        pendingGitOperations.delete(data.requestId);
      }
    });

    socket.on('git:diff:response', (data: { requestId: string; success: boolean; data?: unknown; error?: string }) => {
      const pending = pendingGitOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('git:diff:response', data);
        pendingGitOperations.delete(data.requestId);
      }
    });

    socket.on('git:stage:response', (data: { requestId: string; success: boolean; error?: string }) => {
      const pending = pendingGitOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('git:stage:response', data);
        pendingGitOperations.delete(data.requestId);
      }
    });

    socket.on('git:unstage:response', (data: { requestId: string; success: boolean; error?: string }) => {
      const pending = pendingGitOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('git:unstage:response', data);
        pendingGitOperations.delete(data.requestId);
      }
    });

    socket.on('git:commit:response', (data: { requestId: string; success: boolean; data?: unknown; error?: string }) => {
      const pending = pendingGitOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('git:commit:response', data);
        pendingGitOperations.delete(data.requestId);
      }
    });

    socket.on('git:discard:response', (data: { requestId: string; success: boolean; error?: string }) => {
      const pending = pendingGitOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('git:discard:response', data);
        pendingGitOperations.delete(data.requestId);
      }
    });

    // Docker response handlers (relay from agent to browser)
    socket.on('docker:status:response', (data: { requestId: string; success: boolean; data?: unknown; error?: string }) => {
      const pending = pendingDockerOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('docker:status:response', data);
        pendingDockerOperations.delete(data.requestId);
      }
    });

    socket.on('docker:logs:response', (data: { requestId: string; success: boolean; data?: unknown; error?: string }) => {
      const pending = pendingDockerOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('docker:logs:response', data);
        pendingDockerOperations.delete(data.requestId);
      }
    });

    socket.on('docker:start:response', (data: { requestId: string; success: boolean; error?: string }) => {
      const pending = pendingDockerOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('docker:start:response', data);
        pendingDockerOperations.delete(data.requestId);
      }
    });

    socket.on('docker:stop:response', (data: { requestId: string; success: boolean; error?: string }) => {
      const pending = pendingDockerOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('docker:stop:response', data);
        pendingDockerOperations.delete(data.requestId);
      }
    });

    socket.on('docker:restart:response', (data: { requestId: string; success: boolean; error?: string }) => {
      const pending = pendingDockerOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('docker:restart:response', data);
        pendingDockerOperations.delete(data.requestId);
      }
    });

    // Stats response handler (relay from agent to browser)
    socket.on('stats:response', (data: { requestId: string; success: boolean; stats?: unknown; error?: string }) => {
      const pending = pendingStatsOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('stats:response', data);
        pendingStatsOperations.delete(data.requestId);
      }
    });

    // Tailscale response handlers (relay from agent to browser)
    socket.on('tailscale:status:response', (data: { requestId: string; success: boolean; status?: unknown; error?: string }) => {
      const pending = pendingTailscaleOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('tailscale:status:response', data);
        pendingTailscaleOperations.delete(data.requestId);
      }
    });

    socket.on('tailscale:connect:response', (data: { requestId: string; success: boolean; error?: string }) => {
      const pending = pendingTailscaleOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('tailscale:connect:response', data);
        pendingTailscaleOperations.delete(data.requestId);
      }
    });

    socket.on('tailscale:disconnect:response', (data: { requestId: string; success: boolean; error?: string }) => {
      const pending = pendingTailscaleOperations.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.socket.emit('tailscale:disconnect:response', data);
        pendingTailscaleOperations.delete(data.requestId);
      }
    });

    // Handle environment variables request from agent
    socket.on('env:request', async (data: { workspaceId: string }) => {
      try {
        if (!socket.workspaceId || socket.workspaceId !== data.workspaceId) {
          socket.emit('env:response', { error: 'Unauthorized' });
          return;
        }

        const workspaceService = await getWorkspaceService();
        const workspace = await workspaceService.getWorkspace(data.workspaceId);

        if (!workspace) {
          socket.emit('env:response', { error: 'Workspace not found' });
          return;
        }

        // Get merged env vars (same logic as container startup)
        const { getEnvVarService } = await import('@/lib/services/env-var-service');
        const envVarService = getEnvVarService();
        const mergedEnvVars = await envVarService.getMergedEnvVars(
          workspace.repositoryId,
          workspace.templateId
        );

        // Add CHROME_PATH environment variable to point to CDP proxy shim
        mergedEnvVars.CHROME_PATH = '/usr/local/bin/chromium';

        socket.emit('env:response', { envVars: mergedEnvVars });
      } catch (error) {
        console.error('env:request handler error:', error);
        socket.emit('env:response', {
          error: error instanceof Error ? error.message : 'Failed to fetch environment variables'
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      await agentRegistry.unregister(socket);
    });
  });

  console.log('Agent namespace /agent initialized');
}

/**
 * Handle attachment to a tab (v2 API)
 * Uses TabStreamManager for persistent sessions
 */
async function handleTabAttach(socket: AuthenticatedSocket, tabId: string) {
  const tabService = getTabService();
  const workspaceService = await getWorkspaceService();
  const repositoryService = getRepositoryService();
  const containerBackend = await getContainerBackendAsync();
  const tabStreamManager = getTabStreamManager();

  // Verify tab exists
  const tab = await tabService.getTab(tabId);
  if (!tab) {
    throw new Error('Tab not found');
  }

  // Verify ownership through workspace -> repository chain
  let workspace = await workspaceService.getWorkspace(tab.workspaceId);
  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const repository = await repositoryService.getRepository(workspace.repositoryId);
  if (!repository || repository.userId !== socket.userId) {
    throw new Error('Not authorized');
  }

  // Check tab status
  if (tab.status !== 'running') {
    throw new Error(`Tab is not running (status: ${tab.status}). Please start the tab first.`);
  }

  // Sync workspace container status with Docker
  workspace = await workspaceService.syncContainerStatus(workspace.id) || workspace;

  // Verify workspace container is running
  if (!workspace.containerId || workspace.containerStatus !== 'running') {
    // Try to start the container
    try {
      workspace = await workspaceService.startContainer(workspace.id);
    } catch (error) {
      throw new Error('Workspace container is not running. Please try again.');
    }
  }

  // Verify container is actually running
  const containerInfo = await containerBackend.getContainerInfo(workspace.containerId!);
  if (!containerInfo || containerInfo.status !== 'running') {
    throw new Error('Workspace container is not running. Please redeploy the workspace.');
  }

  // Detach from any previous tab
  if (socket.tabId && socket.tabId !== tabId) {
    tabStreamManager.detach(socket, socket.tabId);
  }

  socket.tabId = tabId;

  // Use TabStreamManager for persistent streams
  await tabStreamManager.attach(socket, tabId);
}

/**
 * Handle attachment to a session (legacy support)
 */
async function handleSessionAttach(socket: AuthenticatedSocket, sessionId: string) {
  const sessionService = getSessionService();
  const containerBackend = await getContainerBackendAsync();

  // Verify session exists and belongs to user
  const session = await sessionService.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (session.userId !== socket.userId) {
    throw new Error('Not authorized');
  }

  if (session.status !== 'running' || !session.containerId) {
    throw new Error('Session is not running');
  }

  socket.sessionId = sessionId;

  // Send buffered output first
  const buffer = await sessionService.getOutputBuffer(sessionId);
  if (buffer.length > 0) {
    socket.emit('terminal:buffer', { lines: buffer });
  }

  // Attach to container and start Claude CLI (with optional custom command)
  // Parse claudeCommand from TEXT to string array
  const claudeCommand = session.claudeCommand
    ? JSON.parse(session.claudeCommand)
    : null;
  const containerStream = await containerBackend.execCommand(session.containerId, claudeCommand);
  socket.containerStream = containerStream;

  // Stream output to client
  containerStream.stream.on('data', async (chunk: Buffer) => {
    const data = chunk.toString();
    socket.emit('terminal:output', { data });

    // Buffer the output
    await sessionService.appendOutput(sessionId, data);
  });

  containerStream.stream.on('end', () => {
    socket.emit('terminal:end', { message: 'Claude session ended' });
  });

  containerStream.stream.on('error', (error: Error) => {
    console.error('Container stream error:', error);
    socket.emit('error', { message: 'Terminal connection error' });
  });

  // Notify client that attachment is complete
  socket.emit('session:attached', { sessionId });
}

/**
 * Handle attachment to a staging template's container for SSH terminal
 */
async function handleStagingAttach(socket: AuthenticatedSocket, templateId: string) {
  console.log(`[StagingAttach] Received request for templateId: ${templateId}`);
  const templateService = getTemplateService();

  // Get template
  const template = await templateService.getTemplate(templateId);
  if (!template) {
    console.log(`[StagingAttach] Template not found: ${templateId}`);
    throw new Error('Template not found');
  }
  console.log(`[StagingAttach] Template found:`, {
    id: template.id,
    name: template.name,
    status: template.status,
    stagingContainerIp: template.stagingContainerIp,
    userId: template.userId,
  });

  // Verify ownership
  if (template.userId !== socket.userId) {
    console.log(`[StagingAttach] Unauthorized: template.userId=${template.userId}, socket.userId=${socket.userId}`);
    throw new Error('Not authorized');
  }

  // Verify template is in staging status
  if (template.status !== 'staging') {
    console.log(`[StagingAttach] Not in staging mode: ${template.status}`);
    throw new Error('Template is not in staging mode');
  }

  // Verify staging container IP is available
  if (!template.stagingContainerIp) {
    console.log(`[StagingAttach] No staging container IP available`);
    throw new Error('Staging container IP not available');
  }

  // Close any existing staging stream
  if (socket.stagingStream) {
    console.log(`[StagingAttach] Closing existing staging stream`);
    await socket.stagingStream.close().catch(console.error);
  }

  // Create SSH connection to staging container
  console.log(`[StagingAttach] Creating SSH connection to ${template.stagingContainerIp}`);
  const containerStream = await createSSHStream(
    { host: template.stagingContainerIp, username: 'root' },
    { cols: 80, rows: 24, workingDir: '/' }
  );
  console.log(`[StagingAttach] SSH connection established`);

  socket.stagingTemplateId = templateId;
  socket.stagingStream = containerStream;

  // Stream output to client
  containerStream.stream.on('data', (chunk: Buffer) => {
    socket.emit('terminal:output', { data: chunk.toString() });
  });

  containerStream.stream.on('end', () => {
    console.log(`[StagingAttach] Stream ended for template ${templateId}`);
    socket.emit('terminal:end', { message: 'Staging terminal disconnected' });
  });

  containerStream.stream.on('error', (error: Error) => {
    console.error('[StagingAttach] Stream error:', error);
    socket.emit('error', { message: 'Terminal connection error' });
  });

  // Notify client that attachment is complete
  console.log(`[StagingAttach] Emitting staging:attached for ${templateId}`);
  socket.emit('staging:attached', { templateId });
}

/**
 * Push environment variable update to agent via WebSocket
 * @param workspaceId - Workspace to update
 * @param envVars - Complete set of environment variables
 * @param repositoryId - Repository ID for tracking
 * @returns Promise that resolves when agent confirms receipt
 */
export async function pushEnvVarsToAgent(
  workspaceId: string,
  envVars: Record<string, string>,
  repositoryId: string
): Promise<{ success: boolean; error?: string; applied?: { added: number; removed: number; changed: number } }> {
  const agentRegistry = getAgentRegistry();

  if (!agentRegistry.hasAgent(workspaceId)) {
    throw new Error('Agent not connected');
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Agent did not respond to env:update within 30s'));
    }, 30000);

    // Get agent socket
    const socket = agentRegistry.getAgentSocket(workspaceId);
    if (!socket) {
      clearTimeout(timeout);
      reject(new Error('Agent socket not found'));
      return;
    }

    // Listen for response (only once)
    socket.once('env:update:response', (data: {
      workspaceId: string;
      success: boolean;
      error?: string;
      applied?: { added: number; removed: number; changed: number };
    }) => {
      clearTimeout(timeout);

      if (data.success) {
        console.log(`Agent applied env vars for workspace ${workspaceId}:`, data.applied);
        resolve({ success: true, applied: data.applied });
      } else {
        console.error(`Agent failed to apply env vars for workspace ${workspaceId}:`, data.error);
        resolve({ success: false, error: data.error });
      }
    });

    // Send the update command
    console.log(`Pushing ${Object.keys(envVars).length} env vars to agent for workspace ${workspaceId}`);
    socket.emit('env:update', {
      workspaceId,
      repositoryId,
      envVars,
    });
  });
}

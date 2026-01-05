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
import type { ContainerStream } from '@/lib/container';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  tabId?: string;
  sessionId?: string; // Legacy support
  containerStream?: ContainerStream; // Legacy support only
}

// Track pending file uploads for relay between browser and agent
interface PendingUpload {
  socket: AuthenticatedSocket;
  timeoutId: NodeJS.Timeout;
}
const pendingUploads: Map<string, PendingUpload> = new Map();

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'development' ? '*' : false,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

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

    // Handle terminal input
    socket.on('terminal:input', (data: { data: string }) => {
      // Try v2 tab stream manager first
      if (socket.tabId) {
        const sent = tabStreamManager.sendInput(socket.tabId, data.data);
        if (sent) return;
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

        // Fall back to legacy session - use the socket's attached container stream
        if (socket.containerStream) {
          await socket.containerStream.resize(data.cols, data.rows);
        }
      } catch (error) {
        console.error('Error resizing terminal:', error);
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
    socket.on('agent:heartbeat', async (data: { workspaceId: string; tabs: Array<{ tabId: string; status: string }>; metrics?: unknown }) => {
      if (socket.workspaceId && socket.workspaceId === data.workspaceId) {
        await agentRegistry.heartbeat(data.workspaceId, data.tabs);
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
    throw new Error('Workspace container is not running. Please restart the workspace.');
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
  const containerStream = await containerBackend.execCommand(session.containerId, session.claudeCommand);
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

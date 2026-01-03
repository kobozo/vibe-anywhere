import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import {
  getAuthService,
  getTabService,
  getWorkspaceService,
  getRepositoryService,
  getContainerService,
  // Legacy support
  getSessionService,
} from '@/lib/services';
import { getTabStreamManager } from '@/lib/services/tab-stream-manager';
import type { ContainerStream } from '@/types/container';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  tabId?: string;
  sessionId?: string; // Legacy support
  containerStream?: ContainerStream; // Legacy support only
}

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'development' ? '*' : false,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

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
    console.log(`Client connected: ${socket.id}, userId: ${socket.userId}`);

    const tabStreamManager = getTabStreamManager();

    // Handle tab attachment (new v2 API with persistent streams)
    socket.on('tab:attach', async (data: { tabId: string }) => {
      console.log(`Received tab:attach from ${socket.id} for tabId: ${data.tabId}`);
      try {
        await handleTabAttach(socket, data.tabId);
        console.log(`Successfully attached ${socket.id} to tab ${data.tabId}`);
      } catch (error) {
        console.error('Error attaching to tab:', error);
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

        // Fall back to legacy session
        if (socket.sessionId) {
          const containerService = getContainerService();
          const sessionService = getSessionService();
          const session = await sessionService.getSession(socket.sessionId);
          if (session?.containerId) {
            await containerService.resizeTty(session.containerId, data.cols, data.rows);
          }
        }
      } catch (error) {
        console.error('Error resizing terminal:', error);
      }
    });

    // Handle disconnect - DON'T close streams, just detach
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);

      // Detach from all tab streams (keeps streams running)
      tabStreamManager.detachFromAll(socket);

      // Legacy: close socket-attached stream
      if (socket.containerStream) {
        socket.containerStream.close().catch(console.error);
      }
    });
  });

  return io;
}

/**
 * Handle attachment to a tab (v2 API)
 * Uses TabStreamManager for persistent sessions
 */
async function handleTabAttach(socket: AuthenticatedSocket, tabId: string) {
  const tabService = getTabService();
  const workspaceService = getWorkspaceService();
  const repositoryService = getRepositoryService();
  const containerService = getContainerService();
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

  // Verify container is actually running in Docker
  const containerInfo = await containerService.getContainerInfo(workspace.containerId!);
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
  const containerService = getContainerService();

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
  const containerStream = await containerService.execClaude(session.containerId, session.claudeCommand);
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

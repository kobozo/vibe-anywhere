import { eq, desc, sql } from 'drizzle-orm';
import { db, sessions, type Session, type NewSession, type SessionStatus, type ContainerStatus } from '@/lib/db';
import { getGitService, GitService } from './git-service';
import { getContainerBackend, type IContainerBackend } from '@/lib/container';
import { config } from '@/lib/config';
import type { CreateSessionInput, SessionInfo } from '@/types/session';
import { v4 as uuidv4 } from 'uuid';

export class SessionService {
  private gitService: GitService;
  private containerService: IContainerBackend;

  constructor() {
    this.gitService = getGitService();
    this.containerService = getContainerBackend();
  }

  /**
   * Create a new session
   */
  async createSession(userId: string, input: CreateSessionInput): Promise<Session> {
    const sessionId = uuidv4();
    const branchName = input.branchName || `session/${sessionId.slice(0, 8)}`;

    // Create the session record
    const [session] = await db
      .insert(sessions)
      .values({
        id: sessionId,
        name: input.name,
        description: input.description || null,
        userId,
        repoPath: input.repoPath,
        branchName,
        claudeCommand: input.claudeCommand || null,
        status: 'pending',
        containerStatus: 'none',
        outputBuffer: [],
        outputBufferSize: config.session.outputBufferSize,
      })
      .returning();

    return session;
  }

  /**
   * Start a session (create worktree, container, attach)
   */
  async startSession(sessionId: string): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Check if session can be started
    if (session.status !== 'pending' && session.status !== 'stopped' && session.status !== 'error') {
      throw new Error(`Session cannot be started from ${session.status} state`);
    }

    // Update status to starting
    await this.updateSession(sessionId, { status: 'starting' });

    // Track created resources for cleanup on failure
    let worktreePath: string | null = null;
    let containerId: string | null = null;

    try {
      // Ensure Docker image exists
      await this.containerService.ensureImage();

      // Create git worktree from the session's repository
      const worktree = await this.gitService.createWorktree(session.repoPath, session.branchName, sessionId);
      worktreePath = worktree.path;

      // Create container
      containerId = await this.containerService.createContainer(sessionId, {
        workspacePath: worktree.path,
      });

      // Start container
      await this.containerService.startContainer(containerId);

      // Update session with container info
      const [updatedSession] = await db
        .update(sessions)
        .set({
          worktreePath: worktree.path,
          baseCommit: worktree.commit,
          containerId,
          containerStatus: 'running',
          status: 'running',
          updatedAt: Date.now(),
          lastActivityAt: Date.now(),
        })
        .where(eq(sessions.id, sessionId))
        .returning();

      return updatedSession;
    } catch (error) {
      // Clean up any created resources on failure
      if (containerId) {
        try {
          await this.containerService.stopContainer(containerId);
          await this.containerService.removeContainer(containerId);
        } catch (cleanupError) {
          console.error('Failed to cleanup container:', cleanupError);
        }
      }
      if (worktreePath) {
        try {
          await this.gitService.removeWorktree(worktreePath);
        } catch (cleanupError) {
          console.error('Failed to cleanup worktree:', cleanupError);
        }
      }

      // Mark session as error
      await this.updateSession(sessionId, { status: 'error' });
      throw error;
    }
  }

  /**
   * Stop a session (stop container, keep worktree)
   */
  async stopSession(sessionId: string): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Update status to stopping
    await this.updateSession(sessionId, { status: 'stopping' });

    try {
      // Stop container if exists
      if (session.containerId) {
        await this.containerService.stopContainer(session.containerId);
      }

      // Update session
      const [updatedSession] = await db
        .update(sessions)
        .set({
          containerStatus: 'exited',
          status: 'stopped',
          updatedAt: Date.now(),
        })
        .where(eq(sessions.id, sessionId))
        .returning();

      return updatedSession;
    } catch (error) {
      await this.updateSession(sessionId, { status: 'error' });
      throw error;
    }
  }

  /**
   * Destroy a session (remove container and worktree)
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Stop and remove container
    if (session.containerId) {
      try {
        await this.containerService.stopContainer(session.containerId);
        await this.containerService.removeContainer(session.containerId);
      } catch (error) {
        console.error('Error removing container:', error);
      }
    }

    // Remove worktree
    if (session.worktreePath) {
      try {
        await this.gitService.removeWorktree(session.worktreePath);
      } catch (error) {
        console.error('Error removing worktree:', error);
      }
    }

    // Delete session from database
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    return session || null;
  }

  /**
   * List sessions for a user
   */
  async listSessions(userId: string): Promise<Session[]> {
    return db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt));
  }

  /**
   * Update session fields
   */
  async updateSession(
    sessionId: string,
    updates: Partial<Pick<Session, 'status' | 'containerStatus' | 'outputBuffer'>>
  ): Promise<Session> {
    const [updated] = await db
      .update(sessions)
      .set({
        ...updates,
        updatedAt: Date.now(),
      })
      .where(eq(sessions.id, sessionId))
      .returning();

    if (!updated) {
      throw new Error(`Session ${sessionId} not found or update failed`);
    }

    return updated;
  }

  /**
   * Append output to session buffer
   * Uses atomic SQL operations to avoid race conditions
   */
  async appendOutput(sessionId: string, data: string): Promise<void> {
    // Use raw SQL for atomic array append to avoid read-modify-write race condition
    // This ensures concurrent appends don't lose data
    await db.execute(
      sql`
        UPDATE sessions
        SET
          output_buffer = (
            SELECT jsonb_agg(elem)
            FROM (
              SELECT elem
              FROM jsonb_array_elements(COALESCE(output_buffer, '[]'::jsonb) || ${JSON.stringify([data])}::jsonb) AS elem
              ORDER BY (row_number() OVER ()) DESC
              LIMIT output_buffer_size
            ) sub
            ORDER BY (row_number() OVER ())
          ),
          last_activity_at = NOW()
        WHERE id = ${sessionId}
      `
    );
  }

  /**
   * Get output buffer for reconnection
   */
  async getOutputBuffer(sessionId: string): Promise<string[]> {
    const session = await this.getSession(sessionId);
    return session?.outputBuffer || [];
  }

  /**
   * Update container status based on actual Docker state
   */
  async syncContainerStatus(sessionId: string): Promise<Session | null> {
    const session = await this.getSession(sessionId);
    if (!session || !session.containerId) return session;

    const containerInfo = await this.containerService.getContainerInfo(session.containerId);

    if (!containerInfo) {
      // Container no longer exists
      return this.updateSession(sessionId, {
        containerStatus: 'none',
        status: session.status === 'running' ? 'error' : session.status,
      });
    }

    // Map Docker status to our status
    let containerStatus: ContainerStatus = 'none';
    let sessionStatus: SessionStatus = session.status;

    switch (containerInfo.status) {
      case 'running':
        containerStatus = 'running';
        if (session.status !== 'running') {
          sessionStatus = 'running';
        }
        break;
      case 'paused':
        containerStatus = 'paused';
        break;
      case 'exited':
        containerStatus = 'exited';
        if (session.status === 'running') {
          sessionStatus = 'stopped';
        }
        break;
      case 'dead':
        containerStatus = 'dead';
        sessionStatus = 'error';
        break;
      default:
        containerStatus = 'exited';
    }

    if (containerStatus !== session.containerStatus || sessionStatus !== session.status) {
      return this.updateSession(sessionId, { containerStatus, status: sessionStatus });
    }

    return session;
  }

  /**
   * Convert session to public info (without internal fields)
   */
  toSessionInfo(session: Session): SessionInfo {
    return {
      id: session.id,
      name: session.name,
      description: session.description,
      status: session.status,
      containerStatus: session.containerStatus,
      repoPath: session.repoPath,
      branchName: session.branchName,
      worktreePath: session.worktreePath,
      claudeCommand: session.claudeCommand,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastActivityAt: session.lastActivityAt,
    };
  }
}

// Singleton instance
let sessionServiceInstance: SessionService | null = null;

export function getSessionService(): SessionService {
  if (!sessionServiceInstance) {
    sessionServiceInstance = new SessionService();
  }
  return sessionServiceInstance;
}

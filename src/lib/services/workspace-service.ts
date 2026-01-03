import { eq, desc, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workspaces, type Workspace, type NewWorkspace, type WorkspaceStatus, type ContainerStatus, type ContainerBackend } from '@/lib/db/schema';
import { getRepositoryService, RepositoryService } from './repository-service';
import { getContainerBackend, type IContainerBackend } from '@/lib/container';
import { config } from '@/lib/config';
import simpleGit from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CreateWorkspaceInput {
  name: string;
  branchName: string;
  baseBranch?: string; // Branch to create from (defaults to repo's default branch)
}

export class WorkspaceService {
  private worktreesDir: string;
  private repositoryService: RepositoryService;
  private containerBackend: IContainerBackend;

  constructor() {
    this.worktreesDir = config.appHome.worktrees;
    this.repositoryService = getRepositoryService();
    this.containerBackend = getContainerBackend();
  }

  /**
   * Ensure the worktrees directory exists
   */
  async ensureWorktreesDir(): Promise<void> {
    await fs.mkdir(this.worktreesDir, { recursive: true });
  }

  /**
   * Create a new workspace (git worktree) for a repository
   */
  async createWorkspace(repositoryId: string, input: CreateWorkspaceInput): Promise<Workspace> {
    await this.ensureWorktreesDir();

    // Get the repository
    const repo = await this.repositoryService.getRepository(repositoryId);
    if (!repo) {
      throw new Error(`Repository ${repositoryId} not found`);
    }

    const repoPath = this.repositoryService.getAbsolutePath(repo);
    const git = simpleGit(repoPath);

    // Check if branch already exists
    const branches = await git.branch();
    const branchExists = branches.all.includes(input.branchName);

    // Check if this branch is already checked out in the main repo
    const currentBranch = branches.current;
    const branchIsCurrentInMainRepo = currentBranch === input.branchName;

    // Generate workspace ID and worktree path
    const [workspace] = await db
      .insert(workspaces)
      .values({
        repositoryId,
        name: input.name,
        branchName: input.branchName,
        status: 'pending',
      })
      .returning();

    try {
      let workingPath: string;
      let isMainRepoPath = false;

      if (branchIsCurrentInMainRepo) {
        // Branch is already checked out in main repo - use it directly
        workingPath = repoPath;
        isMainRepoPath = true;
      } else {
        // Create a worktree for this branch
        const worktreePath = path.join(this.worktreesDir, workspace.id);

        if (branchExists) {
          // Checkout existing branch in worktree
          await git.raw(['worktree', 'add', worktreePath, input.branchName]);
        } else {
          // Create new branch and worktree
          const baseBranch = input.baseBranch || repo.defaultBranch || 'main';
          await git.raw(['worktree', 'add', '-b', input.branchName, worktreePath, baseBranch]);
        }

        workingPath = worktreePath;
      }

      // Get current commit
      const workingGit = simpleGit(workingPath);
      const log = await workingGit.log({ n: 1 });
      const baseCommit = log.latest?.hash || 'unknown';

      // Mark directory as safe for git
      await workingGit.addConfig('safe.directory', workingPath, false, 'global');

      // Update workspace with path info
      // For main repo, store special marker; for worktree, store workspace ID
      const [updatedWorkspace] = await db
        .update(workspaces)
        .set({
          worktreePath: isMainRepoPath ? `repo:${repoPath}` : workspace.id,
          baseCommit,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspace.id))
        .returning();

      return updatedWorkspace;
    } catch (error) {
      // Clean up database record on failure
      await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
      throw new Error(`Failed to create worktree: ${error}`);
    }
  }

  /**
   * Get a workspace by ID
   */
  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    return workspace || null;
  }

  /**
   * List workspaces for a repository
   */
  async listWorkspaces(repositoryId: string): Promise<Workspace[]> {
    return db
      .select()
      .from(workspaces)
      .where(eq(workspaces.repositoryId, repositoryId))
      .orderBy(desc(workspaces.lastActivityAt));
  }

  /**
   * Delete a workspace (removes container and worktree if applicable)
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Stop and remove container if exists
    if (workspace.containerId) {
      try {
        await this.containerBackend.stopContainer(workspace.containerId);
        await this.containerBackend.removeContainer(workspace.containerId);
      } catch (error) {
        console.error('Failed to remove container:', error);
      }
    }

    // Get repository for git operations
    const repo = await this.repositoryService.getRepository(workspace.repositoryId);
    if (!repo) {
      throw new Error(`Repository ${workspace.repositoryId} not found`);
    }

    // Only remove worktree if this isn't a main repo workspace
    if (workspace.worktreePath && !this.isMainRepoWorkspace(workspace)) {
      const repoPath = this.repositoryService.getAbsolutePath(repo);
      const git = simpleGit(repoPath);

      const worktreePath = path.join(this.worktreesDir, workspace.worktreePath);
      try {
        await git.raw(['worktree', 'remove', worktreePath, '--force']);
      } catch (error) {
        console.error('Failed to remove worktree via git:', error);
        // Try manual cleanup
        try {
          await fs.rm(worktreePath, { recursive: true, force: true });
          await git.raw(['worktree', 'prune']);
        } catch (cleanupError) {
          console.error('Manual cleanup also failed:', cleanupError);
        }
      }
    }
    // Note: For main repo workspaces, we just delete the DB record - the repo stays intact

    // Delete from database (cascades to tabs)
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  }

  /**
   * Archive a workspace (soft delete - keeps worktree but marks as archived)
   */
  async archiveWorkspace(workspaceId: string): Promise<Workspace> {
    const [updated] = await db
      .update(workspaces)
      .set({
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    if (!updated) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    return updated;
  }

  /**
   * Get the absolute path to a workspace's working directory
   */
  getAbsolutePath(workspace: Workspace): string | null {
    if (!workspace.worktreePath) return null;

    // Check if this is a main repo path (prefixed with "repo:")
    if (workspace.worktreePath.startsWith('repo:')) {
      return workspace.worktreePath.substring(5); // Remove "repo:" prefix
    }

    // Otherwise it's a worktree path (workspace ID)
    return path.join(this.worktreesDir, workspace.worktreePath);
  }

  /**
   * Check if workspace uses the main repo (not a worktree)
   */
  isMainRepoWorkspace(workspace: Workspace): boolean {
    return workspace.worktreePath?.startsWith('repo:') || false;
  }

  /**
   * Update workspace status
   */
  async updateStatus(workspaceId: string, status: WorkspaceStatus): Promise<Workspace> {
    const [updated] = await db
      .update(workspaces)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    if (!updated) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    return updated;
  }

  /**
   * Update last activity timestamp
   */
  async touch(workspaceId: string): Promise<void> {
    await db
      .update(workspaces)
      .set({
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
  }

  /**
   * Start the workspace container
   */
  async startContainer(workspaceId: string): Promise<Workspace> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Check if container already exists and is running
    if (workspace.containerId) {
      const info = await this.containerService.getContainerInfo(workspace.containerId);
      if (info?.status === 'running') {
        return workspace; // Already running
      }
      // Container exists but not running - try to start it
      if (info && info.status !== 'exited' && info.status !== 'dead') {
        await this.containerService.startContainer(workspace.containerId);
        return this.updateContainerStatus(workspaceId, workspace.containerId, 'running');
      }
      // Container is dead/exited - remove and recreate
      try {
        await this.containerService.removeContainer(workspace.containerId);
      } catch (e) {
        console.error('Failed to remove old container:', e);
      }
    }

    // Get workspace path
    const workspacePath = this.getAbsolutePath(workspace);
    if (!workspacePath) {
      throw new Error('Workspace has no working directory');
    }

    // Ensure docker image exists
    await this.containerService.ensureImage();

    // Create container
    const containerId = await this.containerService.createContainer(workspaceId, {
      image: config.docker.claudeImage,
      workspacePath,
    });

    // Start container
    await this.containerService.startContainer(containerId);

    // Update workspace
    return this.updateContainerStatus(workspaceId, containerId, 'running');
  }

  /**
   * Stop the workspace container
   */
  async stopContainer(workspaceId: string): Promise<Workspace> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    if (workspace.containerId) {
      try {
        await this.containerService.stopContainer(workspace.containerId);
      } catch (e) {
        console.error('Error stopping container:', e);
      }
    }

    return this.updateContainerStatus(workspaceId, workspace.containerId || null, 'exited');
  }

  /**
   * Update container status in database
   */
  async updateContainerStatus(
    workspaceId: string,
    containerId: string | null,
    containerStatus: ContainerStatus
  ): Promise<Workspace> {
    const [updated] = await db
      .update(workspaces)
      .set({
        containerId,
        containerStatus,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    if (!updated) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    return updated;
  }

  /**
   * Sync workspace container status with Docker
   */
  async syncContainerStatus(workspaceId: string): Promise<Workspace | null> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace || !workspace.containerId) return workspace;

    const containerInfo = await this.containerService.getContainerInfo(workspace.containerId);

    if (!containerInfo) {
      // Container no longer exists
      return this.updateContainerStatus(workspaceId, null, 'none');
    }

    // Map Docker status to our status
    let containerStatus: ContainerStatus = 'none';
    switch (containerInfo.status) {
      case 'running':
        containerStatus = 'running';
        break;
      case 'paused':
        containerStatus = 'paused';
        break;
      case 'exited':
        containerStatus = 'exited';
        break;
      case 'dead':
        containerStatus = 'dead';
        break;
      case 'created':
        containerStatus = 'creating';
        break;
      default:
        containerStatus = 'exited';
    }

    if (containerStatus !== workspace.containerStatus) {
      return this.updateContainerStatus(workspaceId, workspace.containerId, containerStatus);
    }

    return workspace;
  }

  /**
   * Get git status for a workspace
   */
  async getGitStatus(workspaceId: string): Promise<{
    branch: string;
    isClean: boolean;
    staged: string[];
    modified: string[];
    untracked: string[];
  }> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const worktreePath = this.getAbsolutePath(workspace);
    if (!worktreePath) {
      throw new Error('Workspace has no worktree path');
    }

    const git = simpleGit(worktreePath);
    const status = await git.status();

    return {
      branch: status.current || workspace.branchName,
      isClean: status.isClean(),
      staged: status.staged,
      modified: status.modified,
      untracked: status.not_added,
    };
  }

  /**
   * Get git diff for a workspace
   */
  async getGitDiff(workspaceId: string, staged = false): Promise<string> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const worktreePath = this.getAbsolutePath(workspace);
    if (!worktreePath) {
      throw new Error('Workspace has no worktree path');
    }

    const git = simpleGit(worktreePath);
    const args = staged ? ['--staged'] : [];
    return git.diff(args);
  }
}

// Singleton instance
let workspaceServiceInstance: WorkspaceService | null = null;

export function getWorkspaceService(): WorkspaceService {
  if (!workspaceServiceInstance) {
    workspaceServiceInstance = new WorkspaceService();
  }
  return workspaceServiceInstance;
}

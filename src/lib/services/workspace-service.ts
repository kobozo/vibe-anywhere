import { eq, desc, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workspaces, type Workspace, type NewWorkspace, type WorkspaceStatus, type ContainerStatus, type ContainerBackend } from '@/lib/db/schema';
import { getRepositoryService, RepositoryService } from './repository-service';
import { getSSHKeyService } from './ssh-key-service';
import { getContainerBackendAsync, type IContainerBackend } from '@/lib/container';
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
  // Lock to prevent concurrent startContainer calls for the same workspace
  private startContainerLocks: Map<string, Promise<Workspace>> = new Map();

  constructor(containerBackend: IContainerBackend) {
    this.worktreesDir = config.appHome.worktrees;
    this.repositoryService = getRepositoryService();
    this.containerBackend = containerBackend;
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
        // For Proxmox containers, sync changes back before destroying
        if (this.containerBackend.backendType === 'proxmox') {
          await this.syncWorkspaceBack(workspace);
        }
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
   * Uses a lock to prevent race conditions when multiple tabs try to start simultaneously
   */
  async startContainer(workspaceId: string): Promise<Workspace> {
    // Check if there's already a start operation in progress for this workspace
    const existingLock = this.startContainerLocks.get(workspaceId);
    if (existingLock) {
      console.log(`Waiting for existing startContainer operation for workspace ${workspaceId}`);
      return existingLock;
    }

    // Create a lock for this workspace
    const startPromise = this.doStartContainer(workspaceId);
    this.startContainerLocks.set(workspaceId, startPromise);

    try {
      return await startPromise;
    } finally {
      this.startContainerLocks.delete(workspaceId);
    }
  }

  /**
   * Internal method to actually start the container
   */
  private async doStartContainer(workspaceId: string): Promise<Workspace> {
    // Re-fetch workspace to get latest state
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Check if container already exists and is running
    if (workspace.containerId) {
      const info = await this.containerBackend.getContainerInfo(workspace.containerId);
      if (info?.status === 'running') {
        // Update container IP if available (for Proxmox)
        if (info.ipAddress && info.ipAddress !== workspace.containerIp) {
          await this.updateContainerIp(workspaceId, info.ipAddress);
        }
        return workspace; // Already running
      }
      // Container exists but not running - try to start it
      if (info && info.status !== 'exited' && info.status !== 'dead') {
        await this.containerBackend.startContainer(workspace.containerId);
        const updatedInfo = await this.containerBackend.getContainerInfo(workspace.containerId);
        await this.updateContainerIp(workspaceId, updatedInfo?.ipAddress || null);
        return this.updateContainerStatus(workspaceId, workspace.containerId, 'running');
      }
      // Container is dead/exited - remove and recreate
      try {
        await this.containerBackend.removeContainer(workspace.containerId);
      } catch (e) {
        console.error('Failed to remove old container:', e);
      }
    }

    // Get workspace path
    const workspacePath = this.getAbsolutePath(workspace);
    if (!workspacePath) {
      throw new Error('Workspace has no working directory');
    }

    // Ensure image/template exists
    await this.containerBackend.ensureImage();

    // Create container with backend-appropriate config
    const backendType = this.containerBackend.backendType;
    const containerId = await this.containerBackend.createContainer(workspaceId, {
      image: backendType === 'docker' ? config.docker.claudeImage : undefined,
      templateId: backendType === 'proxmox' ? config.proxmox.templateVmid : undefined,
      workspacePath,
    });

    // IMPORTANT: Save containerId to DB immediately to prevent race conditions
    // Other processes will see this and wait instead of creating new containers
    await db
      .update(workspaces)
      .set({
        containerId,
        containerStatus: 'creating',
        containerBackend: backendType as ContainerBackend,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));

    console.log(`Container ${containerId} created for workspace ${workspaceId}, starting...`);

    // Start container
    await this.containerBackend.startContainer(containerId);

    // Get container info (for IP address)
    const containerInfo = await this.containerBackend.getContainerInfo(containerId);

    // For Proxmox containers, clone repo and setup SSH keys
    if (backendType === 'proxmox') {
      console.log(`Setting up Proxmox container ${containerId} for workspace`);

      try {
        const repo = await this.repositoryService.getRepository(workspace.repositoryId);
        if (repo) {
          // Get SSH key for git operations (try repo keys first, then user keys)
          const sshKeyService = getSSHKeyService();
          let keys = await sshKeyService.listRepositoryKeys(repo.id);
          let sshKeyContent: string | undefined;

          // If no repo-specific keys, try to get user's keys
          if (keys.length === 0 && repo.userId) {
            keys = await sshKeyService.listUserKeys(repo.userId);
          }

          // Try to decrypt each key until we find one that works
          for (const key of keys) {
            try {
              sshKeyContent = await sshKeyService.getDecryptedPrivateKey(key.id);
              console.log(`Using SSH key '${key.name}' for git operations`);
              break;
            } catch (error) {
              // Key might have been encrypted with a different AUTH_SECRET
              console.warn(`Could not decrypt SSH key '${key.name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
              // Continue to try next key
            }
          }

          if (!sshKeyContent && keys.length > 0) {
            console.warn(`None of the ${keys.length} SSH keys could be decrypted. Git operations may fail.`);
          }

          // Always sync the local workspace to the container
          // This ensures local changes (even unpushed) are available in the container
          console.log(`Syncing local workspace ${workspacePath} to container ${containerId}`);
          if (this.containerBackend.syncWorkspace) {
            await this.containerBackend.syncWorkspace(containerId, workspacePath, '/workspace');
            console.log('Workspace synced successfully');
          }

          // Sync SSH keys if we have them (for git push/pull from container)
          if (sshKeyContent) {
            const backend = this.containerBackend as { syncSSHKey?: (containerId: string, privateKey: string, keyName: string) => Promise<void> };
            if (backend.syncSSHKey) {
              await backend.syncSSHKey(containerId, sshKeyContent, 'id_ed25519');
              console.log('SSH key synced to container');
            }
          }

          // Set up git in container
          const repoPath = this.repositoryService.getAbsolutePath(repo);
          const git = simpleGit(repoPath);
          const remotes = await git.getRemotes(true);
          const originRemote = remotes.find(r => r.name === 'origin');

          if (originRemote?.refs?.fetch) {
            // Configure remote in container for push/pull
            const backend = this.containerBackend as { execInContainer?: (containerId: string, command: string) => Promise<void> };
            // Remote will be configured via the synced .git folder
            console.log(`Container workspace has remote: ${originRemote.refs.fetch}`);
          }
        }
      } catch (error) {
        console.error('Failed to setup Proxmox container workspace:', error);
        // Continue anyway - container is running but might not have files
      }

      // Provision sidecar agent for Proxmox containers
      try {
        const proxmoxBackend = this.containerBackend as {
          provisionAgent?: (containerId: string, workspaceId: string, agentToken: string) => Promise<void>;
          generateAgentToken?: () => string;
        };

        if (proxmoxBackend.provisionAgent && proxmoxBackend.generateAgentToken) {
          const agentToken = proxmoxBackend.generateAgentToken();

          // Save agent token to database first
          await db
            .update(workspaces)
            .set({
              agentToken,
              updatedAt: new Date(),
            })
            .where(eq(workspaces.id, workspaceId));

          // Provision the agent
          await proxmoxBackend.provisionAgent(containerId, workspaceId, agentToken);
          console.log(`Agent provisioned in container ${containerId}`);
        }
      } catch (error) {
        console.error('Failed to provision agent:', error);
        // Continue anyway - SSH fallback might still work
      }
    }

    // Update workspace with container info
    const [updated] = await db
      .update(workspaces)
      .set({
        containerId,
        containerStatus: 'running',
        containerBackend: backendType as ContainerBackend,
        containerIp: containerInfo?.ipAddress || null,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    return updated;
  }

  /**
   * Update container IP address
   */
  private async updateContainerIp(workspaceId: string, ip: string | null): Promise<void> {
    await db
      .update(workspaces)
      .set({
        containerIp: ip,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
  }

  /**
   * Stop the workspace container
   * For Proxmox containers, syncs changes back to the host first
   */
  async stopContainer(workspaceId: string): Promise<Workspace> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    if (workspace.containerId) {
      // For Proxmox containers, sync changes back before stopping
      if (this.containerBackend.backendType === 'proxmox') {
        await this.syncWorkspaceBack(workspace);
      }

      try {
        await this.containerBackend.stopContainer(workspace.containerId);
      } catch (e) {
        console.error('Error stopping container:', e);
      }
    }

    return this.updateContainerStatus(workspaceId, workspace.containerId || null, 'exited');
  }

  /**
   * Destroy the workspace container but keep the workspace record
   * This stops, syncs back changes, and removes the container completely
   */
  async destroyContainer(workspaceId: string): Promise<Workspace> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    if (workspace.containerId) {
      // For Proxmox containers, sync changes back before destroying
      if (this.containerBackend.backendType === 'proxmox') {
        await this.syncWorkspaceBack(workspace);
      }

      try {
        // Stop the container first
        await this.containerBackend.stopContainer(workspace.containerId);
      } catch (e) {
        console.error('Error stopping container:', e);
      }

      try {
        // Remove the container
        await this.containerBackend.removeContainer(workspace.containerId);
        console.log(`Container ${workspace.containerId} destroyed for workspace ${workspaceId}`);
      } catch (e) {
        console.error('Error removing container:', e);
      }
    }

    // Clear container info in database
    const [updated] = await db
      .update(workspaces)
      .set({
        containerId: null,
        containerStatus: 'none',
        containerIp: null,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    return updated;
  }

  /**
   * Sync changes from the container back to the host workspace
   * This is used for Proxmox containers where files are cloned, not mounted
   */
  private async syncWorkspaceBack(workspace: Workspace): Promise<void> {
    if (!workspace.containerId) {
      return;
    }

    const backendType = this.containerBackend.backendType;
    if (backendType !== 'proxmox') {
      return; // Docker uses bind mounts, no sync needed
    }

    const workspacePath = this.getAbsolutePath(workspace);
    if (!workspacePath) {
      console.warn('Cannot sync back: workspace has no local path');
      return;
    }

    // Check if backend supports sync back
    const backend = this.containerBackend as { syncWorkspaceBack?: (containerId: string, remotePath: string, localPath: string) => Promise<void> };
    if (!backend.syncWorkspaceBack) {
      console.warn('Container backend does not support syncWorkspaceBack');
      return;
    }

    try {
      console.log(`Syncing changes from container ${workspace.containerId} back to ${workspacePath}`);
      await backend.syncWorkspaceBack(workspace.containerId, '/workspace', workspacePath);
      console.log(`Successfully synced changes back from container ${workspace.containerId}`);
    } catch (error) {
      console.error(`Failed to sync workspace back from container:`, error);
      // Don't throw - we still want to stop the container even if sync fails
    }
  }

  /**
   * Public method to manually sync changes back from container
   * Useful for saving work without stopping the container
   */
  async syncChangesBack(workspaceId: string): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    if (!workspace.containerId) {
      throw new Error('Workspace has no running container');
    }

    const info = await this.containerBackend.getContainerInfo(workspace.containerId);
    if (info?.status !== 'running') {
      throw new Error('Container is not running');
    }

    await this.syncWorkspaceBack(workspace);
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
   * Sync workspace container status with backend
   */
  async syncContainerStatus(workspaceId: string): Promise<Workspace | null> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace || !workspace.containerId) return workspace;

    const containerInfo = await this.containerBackend.getContainerInfo(workspace.containerId);

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
let workspaceServicePromise: Promise<WorkspaceService> | null = null;

export async function getWorkspaceService(): Promise<WorkspaceService> {
  if (workspaceServiceInstance) {
    return workspaceServiceInstance;
  }

  if (!workspaceServicePromise) {
    workspaceServicePromise = (async () => {
      const backend = await getContainerBackendAsync();
      workspaceServiceInstance = new WorkspaceService(backend);
      return workspaceServiceInstance;
    })();
  }

  return workspaceServicePromise;
}

import { eq, desc, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workspaces, workspaceShares, users, type Workspace, type WorkspaceShare, type WorkspaceStatus, type ContainerStatus, type ContainerBackend } from '@/lib/db/schema';
import { getRepositoryService, RepositoryService } from './repository-service';
import { getSSHKeyService } from './ssh-key-service';
import { getTemplateService } from './template-service';
import { getEnvVarService } from './env-var-service';
import { getGitHooksService } from './git-hooks-service';
import { getTailscaleService } from './tailscale-service';
import { getContainerBackendAsync, type IContainerBackend } from '@/lib/container';
import { getWorkspaceStateBroadcaster } from './workspace-state-broadcaster';
import { gitCloneInContainer, getGitStatusInContainer, isRepoClonedInContainer, type GitStatusResult } from '@/lib/container/proxmox/ssh-stream';
import { buildWorkspaceTags } from '@/lib/container/proxmox/tags';
import { config } from '@/lib/config';
import { startupProgressStore } from './startup-progress-store';
import type { StartupStep } from '@/lib/types/startup-progress';
import { NotFoundError, AuthError } from '@/lib/errors';

export interface CreateWorkspaceInput {
  name: string;
  branchName: string;
  baseBranch?: string; // Branch to create from (defaults to repo's default branch)
  // Advanced options (all optional)
  staticIpAddress?: string; // CIDR format: 192.168.3.50/24
  staticIpGateway?: string; // Gateway IP: 192.168.3.1
  forcedVmid?: number; // Force specific VMID
  overrideTemplateId?: string; // Override repository's default template
}

export class WorkspaceService {
  private repositoryService: RepositoryService;
  private containerBackend: IContainerBackend;
  // Lock to prevent concurrent startContainer calls for the same workspace
  private startContainerLocks: Map<string, Promise<Workspace>> = new Map();

  constructor(containerBackend: IContainerBackend) {
    this.repositoryService = getRepositoryService();
    this.containerBackend = containerBackend;
  }

  /**
   * Emit startup progress for a workspace
   */
  private emitProgress(workspaceId: string, step: StartupStep, message?: string): void {
    console.log(`[WorkspaceService] Emitting progress: workspace=${workspaceId}, step=${step}`);
    const progress = startupProgressStore.setProgress(workspaceId, step, message);
    try {
      const broadcaster = getWorkspaceStateBroadcaster();
      broadcaster.broadcastStartupProgress(progress);
    } catch (e) {
      console.error('[WorkspaceService] Failed to broadcast progress:', e);
    }
  }

  /**
   * Emit startup error for a workspace
   */
  private emitProgressError(workspaceId: string, error: string): void {
    const progress = startupProgressStore.setError(workspaceId, error);
    if (progress) {
      try {
        const broadcaster = getWorkspaceStateBroadcaster();
        broadcaster.broadcastStartupProgress(progress);
      } catch (e) {
        // Broadcaster might not be initialized
      }
    }
  }

  /**
   * Create a new workspace record
   * NOTE: No local worktree is created - cloning happens in container
   */
  async createWorkspace(repositoryId: string, input: CreateWorkspaceInput): Promise<Workspace> {
    // Get the repository
    const repo = await this.repositoryService.getRepository(repositoryId);
    if (!repo) {
      throw new Error(`Repository ${repositoryId} not found`);
    }

    // Ensure repository has a clone URL
    if (!repo.cloneUrl) {
      throw new Error('Repository has no clone URL configured');
    }

    // Get template from repository (snapshot at creation time)
    // Advanced override takes precedence over repository template
    const templateService = getTemplateService();
    let templateId: string | null = null;

    if (input.overrideTemplateId) {
      // Verify override template exists and is ready
      const overrideTemplate = await templateService.getTemplate(input.overrideTemplateId);
      if (overrideTemplate && overrideTemplate.status === 'ready') {
        templateId = overrideTemplate.id;
      } else {
        throw new Error('Override template not found or not ready');
      }
    } else {
      const template = await templateService.getTemplateForRepository(repositoryId);
      templateId = template?.id || null;
    }

    // Create database record with advanced options
    const [workspace] = await db
      .insert(workspaces)
      .values({
        repositoryId,
        templateId,
        name: input.name,
        branchName: input.branchName,
        status: 'active',
        containerBackend: 'proxmox', // Default to Proxmox for new workspaces
        // Advanced options (stored for container creation)
        staticIpAddress: input.staticIpAddress || null,
        staticIpGateway: input.staticIpGateway || null,
        forcedVmid: input.forcedVmid || null,
        overrideTemplateId: input.overrideTemplateId || null,
      })
      .returning();

    return workspace;
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
   * Includes workspaces owned by user (via repository) and workspaces shared with user
   *
   * @param repositoryId - Repository ID to filter workspaces
   * @param userId - User ID to check ownership and shares
   * @param role - User role (optional, for admin visibility)
   * @returns Array of workspaces with share metadata
   */
  async listWorkspaces(
    repositoryId: string,
    userId?: string,
    role?: string
  ): Promise<Array<Workspace & {
    isShared?: boolean;
    sharedBy?: string;
    permissions?: string[];
    shareCount?: number;
    sharedWithUsernames?: string[];
  }>> {
    // If no userId provided, use legacy behavior (all workspaces for repository)
    if (!userId) {
      return db
        .select()
        .from(workspaces)
        .where(eq(workspaces.repositoryId, repositoryId))
        .orderBy(desc(workspaces.lastActivityAt));
    }

    // Get repository to check ownership
    const repo = await this.repositoryService.getRepository(repositoryId);
    if (!repo) {
      return [];
    }

    const isOwner = repo.userId === userId;

    // If user owns the repository, return all workspaces with share counts
    if (isOwner) {
      const ownedWorkspaces = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.repositoryId, repositoryId))
        .orderBy(desc(workspaces.lastActivityAt));

      // Fetch share information for each owned workspace
      const workspacesWithShares = await Promise.all(
        ownedWorkspaces.map(async (ws) => {
          // Get all shares for this workspace
          const shares = await db
            .select({
              share: workspaceShares,
              user: users,
            })
            .from(workspaceShares)
            .innerJoin(users, eq(workspaceShares.sharedWithUserId, users.id))
            .where(eq(workspaceShares.workspaceId, ws.id));

          const shareCount = shares.length;
          const sharedWithUsernames = shares.map(({ user }) => user.username);

          return {
            ...ws,
            isShared: false,
            shareCount,
            sharedWithUsernames,
          };
        })
      );

      return workspacesWithShares;
    }

    // User doesn't own the repository - return only shared workspaces
    const sharedWorkspaces = await db
      .select({
        workspace: workspaces,
        share: workspaceShares,
        owner: users,
      })
      .from(workspaceShares)
      .innerJoin(workspaces, eq(workspaceShares.workspaceId, workspaces.id))
      .innerJoin(users, eq(workspaceShares.sharedByUserId, users.id))
      .where(
        and(
          eq(workspaces.repositoryId, repositoryId),
          eq(workspaceShares.sharedWithUserId, userId)
        )
      )
      .orderBy(desc(workspaces.lastActivityAt));

    // Map to workspace with share metadata
    return sharedWorkspaces.map(({ workspace, share, owner }) => ({
      ...workspace,
      isShared: true,
      sharedBy: owner.username,
      permissions: share.permissions,
    }));
  }

  /**
   * Delete a workspace
   * NOTE: Worktree cleanup removed - there are no local worktrees
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

    // Delete from database (cascades to tabs)
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  }

  /**
   * Archive a workspace (soft delete)
   */
  async archiveWorkspace(workspaceId: string): Promise<Workspace> {
    const [updated] = await db
      .update(workspaces)
      .set({
        status: 'archived',
        updatedAt: Date.now(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    if (!updated) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    return updated;
  }

  /**
   * Update workspace status
   */
  async updateStatus(workspaceId: string, status: WorkspaceStatus): Promise<Workspace> {
    const [updated] = await db
      .update(workspaces)
      .set({
        status,
        updatedAt: Date.now(),
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
        lastActivityAt: Date.now(),
        updatedAt: Date.now(),
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
   * Ensure the repository is cloned in the container
   * This is called after starting any container (new or existing)
   */
  private async ensureRepoCloned(
    workspaceId: string,
    containerIp: string,
    repo: {
      id: string;
      cloneUrl: string;
      cloneDepth: number | null;
      sshKeyId: string | null;
      techStack: string[] | null;
      gitIdentityId?: string | null;
      gitCustomName?: string | null;
      gitCustomEmail?: string | null;
    },
    branchName: string,
    containerId: string,
  ): Promise<void> {
    const backendType = this.containerBackend.backendType;
    if (backendType !== 'proxmox') return; // Only for Proxmox containers

    try {
      // Check if repo is already cloned
      const isCloned = await isRepoClonedInContainer(containerIp);
      if (isCloned) {
        console.log(`Repository already cloned in container for workspace ${workspaceId}`);
        return;
      }

      console.log(`Repository not found in container, cloning ${repo.cloneUrl}`);

      // Get SSH key for private repos
      let sshKeyContent: string | undefined;
      if (repo.sshKeyId) {
        try {
          const sshKeyService = getSSHKeyService();
          const key = await sshKeyService.getKey(repo.sshKeyId);
          if (key) {
            sshKeyContent = await sshKeyService.getDecryptedPrivateKey(key.id);
            console.log(`Using repository SSH key '${key.name}' for git clone`);
          }
        } catch (error) {
          console.warn(`Could not decrypt repository SSH key: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Clone repository
      // Note: Git identity is now set by the agent when it connects,
      // so we don't need to pass it during clone. The agent will send
      // git:config with the correct identity after registration.
      await gitCloneInContainer(containerIp, {
        url: repo.cloneUrl,
        branch: branchName,
        depth: repo.cloneDepth ?? undefined,
        sshKeyContent,
      });
      console.log('Repository cloned successfully');

      // Install missing tech stacks if needed
      if (repo.techStack && repo.techStack.length > 0) {
        try {
          const templateService = getTemplateService();
          const repoTemplate = await templateService.getTemplateForRepository(repo.id);
          const templateTechStacks = repoTemplate?.techStacks || [];
          const missingStacks = repo.techStack.filter(
            (stackId: string) => !templateTechStacks.includes(stackId)
          );

          if (missingStacks.length > 0) {
            console.log(`Installing missing tech stacks: ${missingStacks.join(', ')}`);
            // Emit installing tech stack progress
            this.emitProgress(workspaceId, 'installing_tech_stack');
            const techStackBackend = this.containerBackend as {
              installTechStacks?: (containerId: string, techStackIds: string[]) => Promise<void>;
            };
            if (techStackBackend.installTechStacks) {
              await techStackBackend.installTechStacks(containerId, missingStacks);
            }
          }
        } catch (techStackError) {
          console.error('Failed to install tech stacks:', techStackError);
        }
      }
    } catch (error) {
      console.error('Failed to ensure repo cloned:', error);
      throw error; // Re-throw so caller knows clone failed
    }
  }

  /**
   * Internal method to actually start the container
   */
  private async doStartContainer(workspaceId: string): Promise<Workspace> {
    // Emit initializing progress
    this.emitProgress(workspaceId, 'initializing');

    try {
      return await this.doStartContainerInternal(workspaceId);
    } catch (error) {
      // Emit error progress
      this.emitProgressError(
        workspaceId,
        error instanceof Error ? error.message : 'Unknown error during container startup'
      );
      throw error;
    }
  }

  /**
   * Internal implementation of container start (wrapped for error handling)
   */
  private async doStartContainerInternal(workspaceId: string): Promise<Workspace> {
    // Re-fetch workspace to get latest state
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Get repository for clone URL and settings
    const repo = await this.repositoryService.getRepository(workspace.repositoryId);
    if (!repo || !repo.cloneUrl) {
      throw new Error('Repository has no clone URL configured');
    }

    // Check if container already exists and is running
    const oldContainerId = workspace.containerId;

    if (workspace.containerId) {
      const info = await this.containerBackend.getContainerInfo(workspace.containerId);
      if (info?.status === 'running') {
        // Container already running - emit connecting progress and wait for agent
        this.emitProgress(workspaceId, 'connecting');
        // Update container IP if available
        const containerIp = info.ipAddress || workspace.containerIp;
        if (info.ipAddress && info.ipAddress !== workspace.containerIp) {
          await this.updateContainerIp(workspaceId, info.ipAddress);
        }
        // Ensure repo is cloned (may have been started before refactor)
        if (containerIp) {
          await this.ensureRepoCloned(workspaceId, containerIp, repo, workspace.branchName, workspace.containerId);
        }
        return workspace; // Already running
      }
      // Container exists but not running - try to start it
      // Start if status is 'exited' (shutdown), 'paused', or 'created'
      if (info && (info.status === 'exited' || info.status === 'paused' || info.status === 'created')) {
        this.emitProgress(workspaceId, 'starting_container');
        await this.containerBackend.startContainer(workspace.containerId);
        this.emitProgress(workspaceId, 'configuring_network');
        const updatedInfo = await this.containerBackend.getContainerInfo(workspace.containerId);
        const containerIp = updatedInfo?.ipAddress || null;
        await this.updateContainerIp(workspaceId, containerIp);
        // Ensure repo is cloned after starting (may have been started before refactor)
        if (containerIp) {
          this.emitProgress(workspaceId, 'cloning_repository');
          await this.ensureRepoCloned(workspaceId, containerIp, repo, workspace.branchName, workspace.containerId);
        }
        this.emitProgress(workspaceId, 'connecting');
        return this.updateContainerStatus(workspaceId, workspace.containerId, 'running');
      }
      // Container is dead or doesn't exist - remove and recreate
      if (info?.status === 'dead' || !info) {
        try {
          await this.containerBackend.removeContainer(workspace.containerId);
        } catch (e) {
          console.error('Failed to remove old container:', e);
        }
      }
    }

    // Ensure image/template exists
    await this.containerBackend.ensureImage();

    // Emit creating container progress
    this.emitProgress(workspaceId, 'creating_container');

    // Create container with backend-appropriate config
    const backendType = this.containerBackend.backendType;

    // Determine VMID: forcedVmid > reuseVmid (for redeploy) > auto-allocate
    let reuseVmid: number | undefined;
    if (backendType === 'proxmox') {
      if (workspace.forcedVmid) {
        // User specified a forced VMID
        reuseVmid = workspace.forcedVmid;
      } else if (oldContainerId) {
        // Redeploy: reuse the old VMID
        reuseVmid = parseInt(oldContainerId, 10);
      }
    }

    // Get template VMID for Proxmox
    let proxmoxTemplateVmid: number | undefined;
    if (backendType === 'proxmox') {
      const templateService = getTemplateService();
      // Prefer workspace's saved template, fall back to repository template
      if (workspace.templateId) {
        const template = await templateService.getTemplate(workspace.templateId);
        proxmoxTemplateVmid = template?.vmid ?? undefined;
      }
      if (!proxmoxTemplateVmid) {
        const templateVmid = await templateService.getTemplateVmidForRepository(workspace.repositoryId);
        proxmoxTemplateVmid = templateVmid ?? config.proxmox.templateVmid;
      }
    }

    // Build tags for Proxmox container (repository name + tech stacks)
    const tags = backendType === 'proxmox'
      ? buildWorkspaceTags(repo.name, repo.techStack || [])
      : undefined;

    const containerId = await this.containerBackend.createContainer(workspaceId, {
      templateId: proxmoxTemplateVmid,
      reuseVmid,
      // Pass repository resource overrides (undefined means use global defaults)
      memoryLimit: repo.resourceMemory ? `${repo.resourceMemory}m` : undefined,
      cpuLimit: repo.resourceCpuCores ?? undefined,
      diskSize: repo.resourceDiskSize ?? undefined,
      // Pass static IP configuration from workspace advanced options
      staticIp: workspace.staticIpAddress ?? undefined,
      gateway: workspace.staticIpGateway ?? undefined,
      // Proxmox tags for filtering (repo name + tech stacks)
      tags,
    });

    // Save containerId immediately to prevent race conditions
    await db
      .update(workspaces)
      .set({
        containerId,
        containerStatus: 'creating',
        containerBackend: backendType as ContainerBackend,
        updatedAt: Date.now(),
      })
      .where(eq(workspaces.id, workspaceId));

    console.log(`Container ${containerId} created for workspace ${workspaceId}, starting...`);

    // Emit starting container progress
    this.emitProgress(workspaceId, 'starting_container');

    // Start container
    await this.containerBackend.startContainer(containerId);

    // Emit configuring network progress
    this.emitProgress(workspaceId, 'configuring_network');

    // Get container info (for IP address)
    const containerInfo = await this.containerBackend.getContainerInfo(containerId);
    const containerIp = containerInfo?.ipAddress;

    // For Proxmox containers, clone repo directly in container
    if (backendType === 'proxmox' && containerIp) {
      console.log(`Setting up Proxmox container ${containerId}`);

      // Emit cloning repository progress
      this.emitProgress(workspaceId, 'cloning_repository');

      // Ensure repo is cloned (uses helper which handles SSH keys and tech stacks)
      await this.ensureRepoCloned(workspaceId, containerIp, repo, workspace.branchName, containerId);

      // Inject environment variables to container
      try {
        const envVarService = getEnvVarService();
        const mergedEnvVars = await envVarService.getMergedEnvVars(
          workspace.repositoryId,
          workspace.templateId || repo.templateId
        );

        // Generate ephemeral Tailscale auth key and add to env vars
        const tailscaleService = getTailscaleService();
        if (tailscaleService.isConfigured()) {
          try {
            const authKey = await tailscaleService.generateEphemeralAuthKey([
              `workspace:${workspaceId}`,
              `repository:${repo.name}`,
            ]);
            mergedEnvVars.TAILSCALE_AUTHKEY = authKey.key;
            console.log(`Generated ephemeral Tailscale auth key for workspace ${workspaceId} (expires: ${authKey.expiresAt.toISOString()})`);
          } catch (error) {
            console.warn('Failed to generate Tailscale auth key:', error);
            // Don't fail container startup if Tailscale isn't configured
          }
        }

        // Only inject if there are env vars to inject
        if (Object.keys(mergedEnvVars).length > 0) {
          const proxmoxBackend = this.containerBackend as {
            injectEnvVars?: (containerId: string, envVars: Record<string, string>) => Promise<void>;
          };

          if (proxmoxBackend.injectEnvVars) {
            await proxmoxBackend.injectEnvVars(containerId, mergedEnvVars);
            console.log(`Injected ${Object.keys(mergedEnvVars).length} env vars into container ${containerId}`);
          }
        }
      } catch (error) {
        console.error('Failed to inject environment variables:', error);
        // Don't fail the container startup, just log the error
      }

      // Inject git hooks from repository
      try {
        const gitHooksService = getGitHooksService();
        const repoHooks = await gitHooksService.getRepositoryGitHooks(workspace.repositoryId);

        if (Object.keys(repoHooks).length > 0 && containerIp) {
          await gitHooksService.writeHooksToContainer(containerIp, repoHooks);
          console.log(`Injected ${Object.keys(repoHooks).length} git hooks into container ${containerId}`);
        }
      } catch (error) {
        console.error('Failed to inject git hooks:', error);
        // Don't fail the container startup, just log the error
      }

      // Emit starting agent progress
      this.emitProgress(workspaceId, 'starting_agent');

      // Provision sidecar agent
      try {
        const proxmoxBackend = this.containerBackend as {
          provisionAgent?: (containerId: string, workspaceId: string, agentToken: string) => Promise<void>;
          generateAgentToken?: () => string;
        };

        if (proxmoxBackend.provisionAgent && proxmoxBackend.generateAgentToken) {
          const agentToken = proxmoxBackend.generateAgentToken();
          await db
            .update(workspaces)
            .set({ agentToken, updatedAt: Date.now() })
            .where(eq(workspaces.id, workspaceId));

          await proxmoxBackend.provisionAgent(containerId, workspaceId, agentToken);
          console.log(`Agent provisioned in container ${containerId}`);

          // Emit connecting progress - waiting for agent to connect
          this.emitProgress(workspaceId, 'connecting');
        }
      } catch (error) {
        console.error('Failed to provision agent:', error);
      }
    }

    // Update workspace with container info
    const [updated] = await db
      .update(workspaces)
      .set({
        containerId,
        containerStatus: 'running',
        containerBackend: backendType as ContainerBackend,
        containerIp: containerIp || null,
        updatedAt: Date.now(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    // Broadcast container started
    try {
      const broadcaster = getWorkspaceStateBroadcaster();
      broadcaster.broadcastContainerStatus(workspaceId, containerId, 'running', containerIp || null);
    } catch (e) {
      // Broadcaster might not be initialized
    }

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
        updatedAt: Date.now(),
      })
      .where(eq(workspaces.id, workspaceId));
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
        await this.containerBackend.stopContainer(workspace.containerId);
      } catch (e) {
        console.error('Error stopping container:', e);
      }
    }

    return this.updateContainerStatus(workspaceId, workspace.containerId || null, 'exited');
  }

  /**
   * Restart the workspace container (true restart, preserves state)
   */
  async restartContainer(workspaceId: string): Promise<Workspace> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    if (!workspace.containerId) {
      throw new Error('No container to restart');
    }

    await this.containerBackend.restartContainer(workspace.containerId);

    // Sync status after restart
    const updated = await this.syncContainerStatus(workspaceId);
    return updated ?? workspace;
  }

  /**
   * Check for uncommitted changes in the container
   */
  async checkUncommittedChanges(workspaceId: string): Promise<GitStatusResult> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Default: no changes
    const defaultResult: GitStatusResult = { hasChanges: false, staged: 0, modified: 0, untracked: 0 };

    if (!workspace.containerId || !workspace.containerIp) {
      return defaultResult;
    }

    // Check container is running
    const info = await this.containerBackend.getContainerInfo(workspace.containerId);
    if (info?.status !== 'running') {
      return defaultResult;
    }

    try {
      const status = await getGitStatusInContainer(workspace.containerIp);

      // Update cached flag in database
      await db
        .update(workspaces)
        .set({
          hasUncommittedChanges: status.hasChanges,
          updatedAt: Date.now(),
        })
        .where(eq(workspaces.id, workspaceId));

      return status;
    } catch (error) {
      console.error('Failed to check git status in container:', error);
      return defaultResult;
    }
  }

  /**
   * Destroy the workspace container but keep the workspace record
   */
  async destroyContainer(workspaceId: string): Promise<Workspace> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    if (workspace.containerId) {
      try {
        await this.containerBackend.stopContainer(workspace.containerId);
      } catch (e) {
        console.error('Error stopping container:', e);
      }

      try {
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
        hasUncommittedChanges: false,
        updatedAt: Date.now(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    // Broadcast container destroyed
    try {
      const broadcaster = getWorkspaceStateBroadcaster();
      broadcaster.broadcastContainerStatus(workspaceId, null, 'none', null);
    } catch (e) {
      // Broadcaster might not be initialized
    }

    return updated;
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
        updatedAt: Date.now(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    if (!updated) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Broadcast container status change
    try {
      const broadcaster = getWorkspaceStateBroadcaster();
      broadcaster.broadcastContainerStatus(workspaceId, containerId, containerStatus, updated.containerIp);
    } catch (e) {
      // Broadcaster might not be initialized
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
      return this.updateContainerStatus(workspaceId, null, 'none');
    }

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
   * Get git status for a workspace (from container)
   */
  async getGitStatus(workspaceId: string): Promise<{
    branch: string;
    isClean: boolean;
    staged: number;
    modified: number;
    untracked: number;
  }> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    if (!workspace.containerIp) {
      // No container running - return workspace branch info
      return {
        branch: workspace.branchName,
        isClean: true,
        staged: 0,
        modified: 0,
        untracked: 0,
      };
    }

    try {
      const status = await getGitStatusInContainer(workspace.containerIp);
      return {
        branch: workspace.branchName,
        isClean: !status.hasChanges,
        staged: status.staged,
        modified: status.modified,
        untracked: status.untracked,
      };
    } catch (error) {
      console.error('Failed to get git status from container:', error);
      return {
        branch: workspace.branchName,
        isClean: true,
        staged: 0,
        modified: 0,
        untracked: 0,
      };
    }
  }

  /**
   * Check if user has permission to access a workspace
   * @param workspaceId - Workspace ID to check
   * @param userId - User ID to check
   * @param requiredPermission - Permission required: 'view', 'execute', or 'modify'
   * @returns Object with { hasPermission: boolean, isOwner: boolean, isAdmin: boolean, share?: WorkspaceShare }
   */
  async checkWorkspacePermission(
    workspaceId: string,
    userId: string,
    requiredPermission: 'view' | 'execute' | 'modify'
  ): Promise<{
    hasPermission: boolean;
    isOwner: boolean;
    isAdmin: boolean;
    share?: WorkspaceShare;
  }> {
    // Get workspace
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      return { hasPermission: false, isOwner: false, isAdmin: false };
    }

    // Get repository to check ownership
    const repo = await this.repositoryService.getRepository(workspace.repositoryId);
    if (!repo) {
      return { hasPermission: false, isOwner: false, isAdmin: false };
    }

    // Get user to check role
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return { hasPermission: false, isOwner: false, isAdmin: false };
    }

    const isOwner = repo.userId === userId;
    const isAdmin = user.role === 'admin';

    // Owner or admin always has permission
    if (isOwner || isAdmin) {
      return { hasPermission: true, isOwner, isAdmin };
    }

    // Check if workspace is shared with user
    const [share] = await db
      .select()
      .from(workspaceShares)
      .where(
        and(
          eq(workspaceShares.workspaceId, workspaceId),
          eq(workspaceShares.sharedWithUserId, userId)
        )
      );

    if (!share) {
      return { hasPermission: false, isOwner: false, isAdmin: false };
    }

    // Check if share has required permission
    const permissions = share.permissions as string[];
    let hasRequiredPermission = false;

    if (requiredPermission === 'view') {
      // View requires 'view' permission
      hasRequiredPermission = permissions.includes('view');
    } else if (requiredPermission === 'execute') {
      // Execute requires 'execute' permission
      hasRequiredPermission = permissions.includes('execute');
    } else if (requiredPermission === 'modify') {
      // Modify is only allowed for owner or admin (never via share)
      hasRequiredPermission = false;
    }

    return {
      hasPermission: hasRequiredPermission,
      isOwner: false,
      isAdmin: false,
      share,
    };
  }

  /**
   * Share a workspace with another user
   * @throws {NotFoundError} if workspace or user doesn't exist
   * @throws {AuthError} if requesting user doesn't own the workspace
   */
  async shareWorkspace(
    workspaceId: string,
    sharedByUserId: string,
    sharedWithUsername: string,
    permissions: string[] = ['view', 'execute']
  ): Promise<WorkspaceShare> {
    // Validate workspace exists
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace', workspaceId);
    }

    // Validate requesting user owns the workspace
    const repo = await this.repositoryService.getRepository(workspace.repositoryId);
    if (!repo) {
      throw new NotFoundError('Repository', workspace.repositoryId);
    }
    if (repo.userId !== sharedByUserId) {
      throw new AuthError('Only workspace owner can share workspaces', 'FORBIDDEN');
    }

    // Validate target user exists
    const [targetUser] = await db.select().from(users).where(eq(users.username, sharedWithUsername));
    if (!targetUser) {
      throw new NotFoundError('User', sharedWithUsername);
    }

    // Create share (unique constraint prevents duplicates)
    const [share] = await db
      .insert(workspaceShares)
      .values({
        workspaceId,
        sharedWithUserId: targetUser.id,
        sharedByUserId,
        permissions,
      })
      .returning();

    return share;
  }

  /**
   * Remove a workspace share
   * @throws {NotFoundError} if workspace or share doesn't exist
   * @throws {AuthError} if requesting user is not owner or recipient
   */
  async unshareWorkspace(
    workspaceId: string,
    sharedWithUserId: string,
    requestingUserId: string
  ): Promise<void> {
    // Validate workspace exists
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace', workspaceId);
    }

    // Get the share
    const [share] = await db
      .select()
      .from(workspaceShares)
      .where(
        and(
          eq(workspaceShares.workspaceId, workspaceId),
          eq(workspaceShares.sharedWithUserId, sharedWithUserId)
        )
      );

    if (!share) {
      throw new NotFoundError('Workspace share', `${workspaceId}:${sharedWithUserId}`);
    }

    // Validate requesting user is owner or recipient
    const repo = await this.repositoryService.getRepository(workspace.repositoryId);
    if (!repo) {
      throw new NotFoundError('Repository', workspace.repositoryId);
    }

    const isOwner = repo.userId === requestingUserId;
    const isRecipient = share.sharedWithUserId === requestingUserId;

    if (!isOwner && !isRecipient) {
      throw new AuthError('Only workspace owner or share recipient can remove shares', 'FORBIDDEN');
    }

    // Delete the share
    await db
      .delete(workspaceShares)
      .where(
        and(
          eq(workspaceShares.workspaceId, workspaceId),
          eq(workspaceShares.sharedWithUserId, sharedWithUserId)
        )
      );
  }

  /**
   * List all shares for a workspace
   * @throws {NotFoundError} if workspace doesn't exist
   * @throws {AuthError} if requesting user doesn't own the workspace and is not admin
   */
  async listWorkspaceShares(workspaceId: string, requestingUserId: string): Promise<WorkspaceShare[]> {
    // Validate workspace exists
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace', workspaceId);
    }

    // Check if requesting user owns the workspace or is admin
    const repo = await this.repositoryService.getRepository(workspace.repositoryId);
    if (!repo) {
      throw new NotFoundError('Repository', workspace.repositoryId);
    }

    const [requestingUser] = await db.select().from(users).where(eq(users.id, requestingUserId));
    if (!requestingUser) {
      throw new NotFoundError('User', requestingUserId);
    }

    const isOwner = repo.userId === requestingUserId;
    const isAdmin = requestingUser.role === 'admin';

    if (!isOwner && !isAdmin) {
      throw new AuthError('Only workspace owner or admin can list shares', 'FORBIDDEN');
    }

    // List all shares for this workspace
    return db.select().from(workspaceShares).where(eq(workspaceShares.workspaceId, workspaceId));
  }

  /**
   * List all workspaces shared with a user
   * Returns workspace details and owner info
   */
  async listSharedWithMe(userId: string): Promise<Array<{
    share: WorkspaceShare;
    workspace: Workspace;
    owner: { id: string; username: string };
  }>> {
    // Get all shares for this user
    const shares = await db
      .select()
      .from(workspaceShares)
      .where(eq(workspaceShares.sharedWithUserId, userId));

    // Fetch workspace and owner details for each share
    const results = await Promise.all(
      shares.map(async (share) => {
        const workspace = await this.getWorkspace(share.workspaceId);
        if (!workspace) {
          return null;
        }

        const repo = await this.repositoryService.getRepository(workspace.repositoryId);
        if (!repo) {
          return null;
        }

        const [owner] = await db.select().from(users).where(eq(users.id, repo.userId));
        if (!owner) {
          return null;
        }

        return {
          share,
          workspace,
          owner: {
            id: owner.id,
            username: owner.username,
          },
        };
      })
    );

    // Filter out null results (deleted workspaces/repos/users)
    return results.filter((r): r is NonNullable<typeof r> => r !== null);
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

import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { repositories, type Repository } from '@/lib/db/schema';

/**
 * Input for creating a repository (metadata-only, no local cloning)
 */
export interface CreateRepoInput {
  name: string;
  description?: string;
  cloneUrl: string;
  sshKeyId?: string;       // SSH key for private repos
  cloneDepth?: number;     // null = full clone, positive int = shallow clone
  defaultBranch?: string;
  techStack?: string[];
  templateId?: string;     // Proxmox template to use for workspaces
  // Resource overrides (null = use global defaults)
  resourceMemory?: number | null;     // Memory in MB
  resourceCpuCores?: number | null;   // CPU cores
  resourceDiskSize?: number | null;   // Disk size in GB
}

/**
 * Repository service - manages repository metadata
 *
 * NOTE: This service no longer handles local repo storage or cloning.
 * Repositories are cloned directly in containers when workspaces start.
 * This service only manages repository metadata in the database.
 */
export class RepositoryService {
  /**
   * Create a new repository record (metadata only - no cloning)
   */
  async createRepository(userId: string, input: CreateRepoInput): Promise<Repository> {
    // Validate URL format
    if (!this.isValidGitUrl(input.cloneUrl)) {
      throw new Error('Invalid git URL. Must be an HTTPS or SSH URL.');
    }

    // Check for duplicate name
    const existing = await db
      .select()
      .from(repositories)
      .where(eq(repositories.userId, userId))
      .then(repos => repos.find(r => r.name.toLowerCase() === input.name.toLowerCase()));

    if (existing) {
      throw new Error(`Repository with name "${input.name}" already exists`);
    }

    // Validate resource values if provided
    this.validateResourceValues(input);

    // Create database record (metadata only)
    const [repo] = await db
      .insert(repositories)
      .values({
        userId,
        name: input.name,
        description: input.description || null,
        cloneUrl: input.cloneUrl,
        cloneDepth: input.cloneDepth || null,
        defaultBranch: input.defaultBranch || 'main',
        sshKeyId: input.sshKeyId || null,
        techStack: input.techStack || [],
        templateId: input.templateId || null,
        resourceMemory: input.resourceMemory ?? null,
        resourceCpuCores: input.resourceCpuCores ?? null,
        resourceDiskSize: input.resourceDiskSize ?? null,
      })
      .returning();

    return repo;
  }

  /**
   * Get a repository by ID
   */
  async getRepository(repoId: string): Promise<Repository | null> {
    const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId));
    return repo || null;
  }

  /**
   * List repositories for a user
   */
  async listRepositories(userId: string): Promise<Repository[]> {
    return db
      .select()
      .from(repositories)
      .where(eq(repositories.userId, userId))
      .orderBy(desc(repositories.updatedAt));
  }

  /**
   * Delete a repository (database record only, no filesystem cleanup needed)
   */
  async deleteRepository(repoId: string): Promise<void> {
    const repo = await this.getRepository(repoId);
    if (!repo) {
      throw new Error(`Repository ${repoId} not found`);
    }

    // Just delete the database record (cascades to workspaces)
    // No filesystem cleanup needed - cloning happens in containers
    await db.delete(repositories).where(eq(repositories.id, repoId));
  }

  /**
   * Update repository settings
   */
  async updateRepository(
    repoId: string,
    updates: {
      name?: string;
      description?: string;
      cloneUrl?: string;
      cloneDepth?: number | null;
      defaultBranch?: string;
      sshKeyId?: string | null;
      templateId?: string | null;
      techStack?: string[];
      resourceMemory?: number | null;
      resourceCpuCores?: number | null;
      resourceDiskSize?: number | null;
    }
  ): Promise<Repository> {
    // Validate resource values if provided
    this.validateResourceValues(updates);

    // If cloneUrl is changing, invalidate the branch cache
    const shouldInvalidateCache = updates.cloneUrl !== undefined;
    const updateData: Record<string, unknown> = {
      ...updates,
      updatedAt: new Date(),
    };

    if (shouldInvalidateCache) {
      updateData.cachedBranches = [];
      updateData.branchesCachedAt = null;
    }

    const [updated] = await db
      .update(repositories)
      .set(updateData)
      .where(eq(repositories.id, repoId))
      .returning();

    if (!updated) {
      throw new Error(`Repository ${repoId} not found`);
    }

    return updated;
  }

  /**
   * Cache staleness threshold (5 minutes)
   */
  private readonly CACHE_STALE_MS = 5 * 60 * 1000;

  /**
   * Update cached branches for a repository
   * Also updates defaultBranch if current value is 'main' and remote reports different
   */
  async updateCachedBranches(
    repoId: string,
    branches: string[],
    detectedDefaultBranch?: string | null
  ): Promise<Repository> {
    const repo = await this.getRepository(repoId);
    if (!repo) {
      throw new Error(`Repository ${repoId} not found`);
    }

    const updates: Record<string, unknown> = {
      cachedBranches: branches,
      branchesCachedAt: new Date(),
      updatedAt: new Date(),
    };

    // Update defaultBranch if:
    // 1. We detected one from remote
    // 2. Current value is placeholder 'main'
    // 3. The detected branch exists in branches list
    if (
      detectedDefaultBranch &&
      repo.defaultBranch === 'main' &&
      branches.includes(detectedDefaultBranch)
    ) {
      updates.defaultBranch = detectedDefaultBranch;
    }

    const [updated] = await db
      .update(repositories)
      .set(updates)
      .where(eq(repositories.id, repoId))
      .returning();

    return updated;
  }

  /**
   * Get cached branches with staleness info
   */
  async getCachedBranches(repoId: string): Promise<{
    branches: string[];
    cachedAt: Date | null;
    isStale: boolean;
  }> {
    const repo = await this.getRepository(repoId);
    if (!repo) {
      throw new Error(`Repository ${repoId} not found`);
    }

    const cachedBranches = (repo.cachedBranches as string[] | null) || [];
    const branchesCachedAt = repo.branchesCachedAt;

    // Determine if cache is stale
    const isStale =
      !branchesCachedAt ||
      Date.now() - new Date(branchesCachedAt).getTime() > this.CACHE_STALE_MS;

    return {
      branches: cachedBranches,
      cachedAt: branchesCachedAt,
      isStale,
    };
  }

  /**
   * Invalidate branch cache (called when cloneUrl changes)
   */
  async invalidateBranchCache(repoId: string): Promise<void> {
    await db
      .update(repositories)
      .set({
        cachedBranches: [],
        branchesCachedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(repositories.id, repoId));
  }

  /**
   * Validate git URL format (HTTPS or SSH)
   */
  private isValidGitUrl(url: string): boolean {
    // HTTPS URLs: https://github.com/user/repo.git
    const httpsPattern = /^https?:\/\/[^\s]+$/;
    // SSH URLs: git@github.com:user/repo.git or ssh://git@github.com/user/repo.git
    const sshPattern = /^(git@[^\s:]+:[^\s]+|ssh:\/\/[^\s]+)$/;

    return httpsPattern.test(url) || sshPattern.test(url);
  }

  /**
   * Validate resource override values
   */
  private validateResourceValues(input: {
    resourceMemory?: number | null;
    resourceCpuCores?: number | null;
    resourceDiskSize?: number | null;
  }): void {
    if (input.resourceMemory !== undefined && input.resourceMemory !== null) {
      if (input.resourceMemory < 512) {
        throw new Error('Memory must be at least 512 MB');
      }
      if (input.resourceMemory > 65536) {
        throw new Error('Memory cannot exceed 64 GB (65536 MB)');
      }
    }

    if (input.resourceCpuCores !== undefined && input.resourceCpuCores !== null) {
      if (input.resourceCpuCores < 1) {
        throw new Error('CPU cores must be at least 1');
      }
      if (input.resourceCpuCores > 32) {
        throw new Error('CPU cores cannot exceed 32');
      }
    }

    if (input.resourceDiskSize !== undefined && input.resourceDiskSize !== null) {
      if (input.resourceDiskSize < 4) {
        throw new Error('Disk size must be at least 4 GB');
      }
      if (input.resourceDiskSize > 500) {
        throw new Error('Disk size cannot exceed 500 GB');
      }
    }
  }
}

// Singleton instance
let repositoryServiceInstance: RepositoryService | null = null;

export function getRepositoryService(): RepositoryService {
  if (!repositoryServiceInstance) {
    repositoryServiceInstance = new RepositoryService();
  }
  return repositoryServiceInstance;
}


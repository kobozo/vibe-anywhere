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
    }
  ): Promise<Repository> {
    const [updated] = await db
      .update(repositories)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(repositories.id, repoId))
      .returning();

    if (!updated) {
      throw new Error(`Repository ${repoId} not found`);
    }

    return updated;
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
}

// Singleton instance
let repositoryServiceInstance: RepositoryService | null = null;

export function getRepositoryService(): RepositoryService {
  if (!repositoryServiceInstance) {
    repositoryServiceInstance = new RepositoryService();
  }
  return repositoryServiceInstance;
}


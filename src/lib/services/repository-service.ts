import { eq, desc, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { repositories, type Repository, type NewRepository, type RepoSourceType } from '@/lib/db/schema';
import { config } from '@/lib/config';
import { getSSHKeyService } from './ssh-key-service';
import simpleGit from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CreateLocalRepoInput {
  name: string;
  description?: string;
  originalPath: string; // Path to existing local repo
}

export interface CloneRepoInput {
  name: string;
  description?: string;
  cloneUrl: string;
  sshKeyId?: string; // Optional SSH key for private repos
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isGitRepo: boolean;
}

export class RepositoryService {
  private repositoriesDir: string;

  constructor() {
    this.repositoriesDir = config.appHome.repositories;
  }

  /**
   * Ensure the repositories directory exists
   */
  async ensureRepoDir(): Promise<void> {
    await fs.mkdir(this.repositoriesDir, { recursive: true });
  }

  /**
   * List directories in a given path (for folder picker)
   * @param browsePath - Path to browse (defaults to user home or APP_HOME_DIR)
   */
  async listDirectories(browsePath?: string): Promise<DirectoryEntry[]> {
    const targetPath = browsePath || process.env.HOME || config.appHome.root;

    try {
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      const dirs: DirectoryEntry[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const fullPath = path.join(targetPath, entry.name);
          let isGitRepo = false;

          // Check if it's a git repository
          try {
            await fs.access(path.join(fullPath, '.git'));
            isGitRepo = true;
          } catch {
            // Not a git repo
          }

          dirs.push({
            name: entry.name,
            path: fullPath,
            isDirectory: true,
            isGitRepo,
          });
        }
      }

      return dirs.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Failed to list directories:', error);
      return [];
    }
  }

  /**
   * Create a repository from an existing local folder
   * Creates a symlink in APP_HOME_DIR/repositories/ pointing to the original
   */
  async createFromLocal(userId: string, input: CreateLocalRepoInput): Promise<Repository> {
    await this.ensureRepoDir();

    // Verify the path is a valid git repository
    const git = simpleGit(input.originalPath);
    try {
      await git.status();
    } catch (error) {
      throw new Error(`Path "${input.originalPath}" is not a valid git repository`);
    }

    // Get default branch
    let defaultBranch = 'main';
    try {
      const branches = await git.branch();
      defaultBranch = branches.current || 'main';
    } catch {
      // Use default
    }

    // Generate a safe symlink name
    const safeName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const symlinkPath = path.join(this.repositoriesDir, safeName);

    // Check if symlink already exists
    try {
      await fs.access(symlinkPath);
      throw new Error(`Repository with name "${input.name}" already exists`);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Create symlink
    await fs.symlink(input.originalPath, symlinkPath);

    // Create database record
    const [repo] = await db
      .insert(repositories)
      .values({
        userId,
        name: input.name,
        description: input.description || null,
        path: safeName, // Relative path (symlink name)
        originalPath: input.originalPath,
        sourceType: 'local',
        defaultBranch,
      })
      .returning();

    return repo;
  }

  /**
   * Clone a repository from a URL
   */
  async cloneRepository(userId: string, input: CloneRepoInput): Promise<Repository> {
    await this.ensureRepoDir();

    // Generate a safe folder name
    const safeName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const clonePath = path.join(this.repositoriesDir, safeName);

    // Check if folder already exists
    try {
      await fs.access(clonePath);
      throw new Error(`Repository with name "${input.name}" already exists`);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Prepare SSH key if provided
    let tempKeyPath: string | null = null;
    try {
      // Set up git with SSH key if provided
      let git = simpleGit();

      if (input.sshKeyId) {
        const sshKeyService = getSSHKeyService();
        tempKeyPath = await sshKeyService.writeTempPrivateKey(input.sshKeyId);

        // Configure git to use the SSH key
        git = simpleGit().env({
          ...process.env,
          GIT_SSH_COMMAND: `ssh -i "${tempKeyPath}" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null`,
        });
      }

      // Clone the repository
      await git.clone(input.cloneUrl, clonePath);
    } catch (error) {
      // Clean up if clone failed
      try {
        await fs.rm(clonePath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      throw new Error(`Failed to clone repository: ${error}`);
    } finally {
      // Clean up temp SSH key
      if (tempKeyPath) {
        try {
          await fs.unlink(tempKeyPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    // Get default branch
    let defaultBranch = 'main';
    try {
      const clonedGit = simpleGit(clonePath);
      const branches = await clonedGit.branch();
      defaultBranch = branches.current || 'main';
    } catch {
      // Use default
    }

    // Create database record
    const [repo] = await db
      .insert(repositories)
      .values({
        userId,
        name: input.name,
        description: input.description || null,
        path: safeName,
        sourceType: 'cloned',
        cloneUrl: input.cloneUrl,
        defaultBranch,
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
   * Delete a repository
   * Note: This does NOT delete the original folder for local repos (only the symlink)
   */
  async deleteRepository(repoId: string): Promise<void> {
    const repo = await this.getRepository(repoId);
    if (!repo) {
      throw new Error(`Repository ${repoId} not found`);
    }

    const repoPath = path.join(this.repositoriesDir, repo.path);

    // Remove the symlink or cloned folder
    try {
      const stats = await fs.lstat(repoPath);
      if (stats.isSymbolicLink()) {
        // Just remove the symlink, not the original
        await fs.unlink(repoPath);
      } else {
        // For cloned repos, remove the entire folder
        await fs.rm(repoPath, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('Failed to remove repository folder:', error);
      // Continue to delete the database record even if folder removal fails
    }

    // Delete from database (cascades to workspaces)
    await db.delete(repositories).where(eq(repositories.id, repoId));
  }

  /**
   * Get the absolute path to a repository
   */
  getAbsolutePath(repo: Repository): string {
    // For local repos, use the original path (more reliable)
    if (repo.sourceType === 'local' && repo.originalPath) {
      return repo.originalPath;
    }
    // For cloned repos, use the path in repositories dir
    return path.join(this.repositoriesDir, repo.path);
  }

  /**
   * Get branches for a repository
   */
  async getBranches(repoId: string): Promise<string[]> {
    const repo = await this.getRepository(repoId);
    if (!repo) {
      throw new Error(`Repository ${repoId} not found`);
    }

    const repoPath = this.getAbsolutePath(repo);
    const git = simpleGit(repoPath);
    const branches = await git.branch();

    return branches.all.map((b) => b.replace('remotes/origin/', ''));
  }

  /**
   * Update repository metadata
   */
  async updateRepository(repoId: string, updates: { name?: string; description?: string }): Promise<Repository> {
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
}

// Singleton instance
let repositoryServiceInstance: RepositoryService | null = null;

export function getRepositoryService(): RepositoryService {
  if (!repositoryServiceInstance) {
    repositoryServiceInstance = new RepositoryService();
  }
  return repositoryServiceInstance;
}

import { db } from '@/lib/db';
import { repositories, type GitHooksJson, type GitHookEntry } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { execSSHCommand } from '@/lib/container/proxmox/ssh-stream';

// Standard git hooks that we manage
export const STANDARD_HOOKS = [
  'pre-commit',
  'prepare-commit-msg',
  'commit-msg',
  'post-commit',
  'pre-push',
  'pre-rebase',
  'post-checkout',
  'post-merge',
] as const;

export type StandardHookName = (typeof STANDARD_HOOKS)[number];

export interface HookSyncStatus {
  inSync: boolean;
  repoOnly: string[];       // Hooks only in repo
  containerOnly: string[];  // Hooks only in container
  different: string[];      // Hooks that exist in both but differ
  synced: string[];         // Hooks that are in sync
}

export interface ContainerHookInfo {
  name: string;
  exists: boolean;
  executable: boolean;
  size: number;
  isSample: boolean;
  content?: string;  // Base64 encoded content
}

export class GitHooksService {
  /**
   * Get git hooks from repository storage
   */
  async getRepositoryGitHooks(repositoryId: string): Promise<GitHooksJson> {
    const [repo] = await db
      .select({ gitHooks: repositories.gitHooks })
      .from(repositories)
      .where(eq(repositories.id, repositoryId));

    return repo?.gitHooks || {};
  }

  /**
   * Save all git hooks to repository storage
   */
  async setRepositoryGitHooks(repositoryId: string, hooks: GitHooksJson): Promise<void> {
    await db
      .update(repositories)
      .set({
        gitHooks: hooks,
        updatedAt: Date.now(),
      })
      .where(eq(repositories.id, repositoryId));
  }

  /**
   * Save a single hook to repository storage
   */
  async saveHookToRepository(
    repositoryId: string,
    hookName: string,
    content: string,
    executable: boolean = true
  ): Promise<void> {
    const currentHooks = await this.getRepositoryGitHooks(repositoryId);

    // Store content as base64
    const base64Content = Buffer.from(content).toString('base64');

    currentHooks[hookName] = {
      content: base64Content,
      executable,
    };

    await this.setRepositoryGitHooks(repositoryId, currentHooks);
  }

  /**
   * Delete a hook from repository storage
   */
  async deleteHookFromRepository(repositoryId: string, hookName: string): Promise<void> {
    const currentHooks = await this.getRepositoryGitHooks(repositoryId);

    delete currentHooks[hookName];

    await this.setRepositoryGitHooks(repositoryId, currentHooks);
  }

  /**
   * Read hooks from a running container (with content)
   */
  async readHooksFromContainer(containerIp: string): Promise<GitHooksJson> {
    const hooks: GitHooksJson = {};

    // Check if .git/hooks directory exists
    const dirCheck = await execSSHCommand(
      { host: containerIp, username: 'root' },
      ['test', '-d', '/workspace/.git/hooks', '&&', 'echo', 'exists'],
      { workingDir: '/workspace' }
    );

    if (!dirCheck.stdout.includes('exists')) {
      return hooks;
    }

    // Read each standard hook that exists
    for (const hookName of STANDARD_HOOKS) {
      try {
        const result = await execSSHCommand(
          { host: containerIp, username: 'root' },
          ['bash', '-c', `
            if [ -f "/workspace/.git/hooks/${hookName}" ]; then
              base64 "/workspace/.git/hooks/${hookName}"
            fi
          `],
          { workingDir: '/workspace' }
        );

        if (result.stdout.trim()) {
          // Check if executable
          const execCheck = await execSSHCommand(
            { host: containerIp, username: 'root' },
            ['test', '-x', `/workspace/.git/hooks/${hookName}`, '&&', 'echo', 'exec'],
            { workingDir: '/workspace' }
          );

          hooks[hookName] = {
            content: result.stdout.trim(),
            executable: execCheck.stdout.includes('exec'),
          };
        }
      } catch {
        // Hook doesn't exist or can't be read, skip
      }
    }

    return hooks;
  }

  /**
   * Write hooks to a running container
   */
  async writeHooksToContainer(containerIp: string, hooks: GitHooksJson): Promise<void> {
    if (!hooks || Object.keys(hooks).length === 0) {
      return;
    }

    // Ensure .git/hooks directory exists
    await execSSHCommand(
      { host: containerIp, username: 'root' },
      ['mkdir', '-p', '/workspace/.git/hooks'],
      { workingDir: '/workspace' }
    );

    // Write each hook
    for (const [hookName, hookEntry] of Object.entries(hooks)) {
      const hookPath = `/workspace/.git/hooks/${hookName}`;

      try {
        // Write hook content (base64 decode)
        await execSSHCommand(
          { host: containerIp, username: 'root' },
          ['bash', '-c', `echo '${hookEntry.content}' | base64 -d > '${hookPath}'`],
          { workingDir: '/workspace' }
        );

        // Set permissions
        const mode = hookEntry.executable ? '755' : '644';
        await execSSHCommand(
          { host: containerIp, username: 'root' },
          ['chmod', mode, hookPath],
          { workingDir: '/workspace' }
        );

        // Ensure kobozo owns the file
        await execSSHCommand(
          { host: containerIp, username: 'root' },
          ['chown', 'kobozo:kobozo', hookPath],
          { workingDir: '/workspace' }
        );

        console.log(`[GitHooksService] Wrote hook ${hookName} to container`);
      } catch (error) {
        console.error(`[GitHooksService] Failed to write hook ${hookName}:`, error);
        throw error;
      }
    }
  }

  /**
   * Compare repository hooks with container hooks
   */
  compareHooks(repoHooks: GitHooksJson, containerHooks: GitHooksJson): HookSyncStatus {
    const repoHookNames = new Set(Object.keys(repoHooks));
    const containerHookNames = new Set(Object.keys(containerHooks));

    const repoOnly: string[] = [];
    const containerOnly: string[] = [];
    const different: string[] = [];
    const synced: string[] = [];

    // Check hooks in repo
    for (const name of repoHookNames) {
      if (!containerHookNames.has(name)) {
        repoOnly.push(name);
      } else {
        // Both have it - compare content
        const repoContent = repoHooks[name].content;
        const containerContent = containerHooks[name].content;

        if (repoContent === containerContent) {
          synced.push(name);
        } else {
          different.push(name);
        }
      }
    }

    // Check hooks only in container
    for (const name of containerHookNames) {
      if (!repoHookNames.has(name)) {
        containerOnly.push(name);
      }
    }

    const inSync = repoOnly.length === 0 &&
                   containerOnly.length === 0 &&
                   different.length === 0;

    return {
      inSync,
      repoOnly,
      containerOnly,
      different,
      synced,
    };
  }

  /**
   * Get list of hooks for display (without content)
   */
  getHooksList(hooks: GitHooksJson): Array<{ name: string; executable: boolean }> {
    return Object.entries(hooks).map(([name, entry]) => ({
      name,
      executable: entry.executable,
    }));
  }
}

// Singleton instance
let gitHooksServiceInstance: GitHooksService | null = null;

export function getGitHooksService(): GitHooksService {
  if (!gitHooksServiceInstance) {
    gitHooksServiceInstance = new GitHooksService();
  }
  return gitHooksServiceInstance;
}

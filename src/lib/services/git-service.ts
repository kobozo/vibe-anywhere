import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import { config } from '@/lib/config';
import type { WorktreeInfo, GitStatus, GitDiff, FileChange, CommitResult } from '@/types/git';
import * as fs from 'fs/promises';
import * as path from 'path';

export class GitService {
  private baseRepoPath: string | undefined;
  private worktreeBasePath: string;

  constructor() {
    this.baseRepoPath = config.git.baseRepoPath;
    this.worktreeBasePath = config.git.worktreeBasePath;
  }

  private getGit(workdir?: string): SimpleGit {
    return simpleGit(workdir || this.baseRepoPath);
  }

  /**
   * Ensure worktree base directory exists
   */
  async ensureWorktreeDir(): Promise<void> {
    await fs.mkdir(this.worktreeBasePath, { recursive: true });
  }

  /**
   * Create a new worktree for a session
   * @param repoPath - Path to the git repository
   * @param branchName - Name of the branch to create/use
   * @param sessionId - Unique session ID for the worktree directory
   */
  async createWorktree(repoPath: string, branchName: string, sessionId: string): Promise<WorktreeInfo> {
    await this.ensureWorktreeDir();

    const worktreePath = path.join(this.worktreeBasePath, sessionId);
    const git = this.getGit(repoPath);

    // Check if branch already exists
    const branches = await git.branch();
    const branchExists = branches.all.includes(branchName);

    if (branchExists) {
      // Checkout existing branch in worktree
      await git.raw(['worktree', 'add', worktreePath, branchName]);
    } else {
      // Create new branch and worktree
      await git.raw(['worktree', 'add', '-b', branchName, worktreePath]);
    }

    // Get current commit
    const worktreeGit = this.getGit(worktreePath);
    const log = await worktreeGit.log({ n: 1 });
    const commit = log.latest?.hash || 'unknown';

    // Mark directory as safe for git
    await worktreeGit.addConfig('safe.directory', worktreePath, false, 'global');

    return {
      path: worktreePath,
      branch: branchName,
      commit,
    };
  }

  /**
   * Remove a worktree
   */
  async removeWorktree(worktreePath: string): Promise<void> {
    const git = this.getGit();

    try {
      // Force remove the worktree
      await git.raw(['worktree', 'remove', worktreePath, '--force']);
    } catch (error) {
      // If worktree remove fails, try manual cleanup
      console.error('Failed to remove worktree via git, attempting manual cleanup:', error);
      try {
        await fs.rm(worktreePath, { recursive: true, force: true });
        // Prune worktree references
        await git.raw(['worktree', 'prune']);
      } catch (cleanupError) {
        console.error('Manual cleanup also failed:', cleanupError);
        throw cleanupError;
      }
    }
  }

  /**
   * Get git status for a worktree
   */
  async getStatus(worktreePath: string): Promise<GitStatus> {
    const git = this.getGit(worktreePath);
    const status: StatusResult = await git.status();

    const mapFileStatus = (file: { path: string; index: string; working_dir: string }): FileChange => {
      let changeStatus: FileChange['status'] = 'modified';
      const statusChar = file.index || file.working_dir;

      switch (statusChar) {
        case 'A':
          changeStatus = 'added';
          break;
        case 'D':
          changeStatus = 'deleted';
          break;
        case 'R':
          changeStatus = 'renamed';
          break;
        case 'C':
          changeStatus = 'copied';
          break;
        case 'M':
        case ' ':
        default:
          changeStatus = 'modified';
          break;
      }

      return {
        path: file.path,
        status: changeStatus,
      };
    };

    return {
      branch: status.current || 'unknown',
      isClean: status.isClean(),
      staged: status.staged.map((f) => mapFileStatus({ path: f, index: 'A', working_dir: '' })),
      unstaged: status.modified.map((f) => mapFileStatus({ path: f, index: '', working_dir: 'M' })),
      untracked: status.not_added,
    };
  }

  /**
   * Get diff for a worktree
   */
  async getDiff(worktreePath: string, staged = false): Promise<GitDiff> {
    const git = this.getGit(worktreePath);

    const args = staged ? ['--staged'] : [];
    const diffSummary = await git.diffSummary(args);

    const files = await Promise.all(
      diffSummary.files.map(async (file) => {
        const diffOutput = await git.diff([...args, '--', file.file]);
        // Handle different file types in diff result
        const insertions = 'insertions' in file ? file.insertions : 0;
        const deletions = 'deletions' in file ? file.deletions : 0;
        return {
          path: file.file,
          additions: insertions,
          deletions: deletions,
          content: diffOutput,
        };
      })
    );

    return {
      files,
      summary: {
        insertions: diffSummary.insertions,
        deletions: diffSummary.deletions,
        filesChanged: diffSummary.changed,
      },
    };
  }

  /**
   * Commit changes in a worktree
   */
  async commit(worktreePath: string, message: string, addAll = true): Promise<CommitResult> {
    const git = this.getGit(worktreePath);

    if (addAll) {
      await git.add('-A');
    }

    const result = await git.commit(message);
    const log = await git.log({ n: 1 });

    if (!log.latest) {
      throw new Error('Failed to get commit info after commit');
    }

    return {
      hash: log.latest.hash,
      message: log.latest.message,
      author: log.latest.author_name,
      date: new Date(log.latest.date),
    };
  }

  /**
   * List all worktrees
   */
  async listWorktrees(): Promise<WorktreeInfo[]> {
    const git = this.getGit();
    const output = await git.raw(['worktree', 'list', '--porcelain']);

    const worktrees: WorktreeInfo[] = [];
    const lines = output.split('\n');

    let currentWorktree: Partial<WorktreeInfo> = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (currentWorktree.path) {
          worktrees.push(currentWorktree as WorktreeInfo);
        }
        currentWorktree = { path: line.substring(9) };
      } else if (line.startsWith('HEAD ')) {
        currentWorktree.commit = line.substring(5);
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.substring(7).replace('refs/heads/', '');
      }
    }

    // Push the last worktree
    if (currentWorktree.path) {
      worktrees.push(currentWorktree as WorktreeInfo);
    }

    // Filter to only include worktrees in our worktree base path
    return worktrees.filter((wt) => wt.path.startsWith(this.worktreeBasePath));
  }

  /**
   * Check if a branch name is valid and available
   */
  async isBranchAvailable(branchName: string): Promise<boolean> {
    const git = this.getGit();
    const branches = await git.branch();
    return !branches.all.includes(branchName);
  }

  /**
   * Delete a branch (only if it's been merged or force=true)
   */
  async deleteBranch(branchName: string, force = false): Promise<void> {
    const git = this.getGit();
    if (force) {
      await git.branch(['-D', branchName]);
    } else {
      await git.branch(['-d', branchName]);
    }
  }
}

// Singleton instance
let gitServiceInstance: GitService | null = null;

export function getGitService(): GitService {
  if (!gitServiceInstance) {
    gitServiceInstance = new GitService();
  }
  return gitServiceInstance;
}

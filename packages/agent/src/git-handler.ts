/**
 * Git operations handler for the agent
 * Runs git commands inside the container workspace
 */

import { simpleGit, SimpleGit, StatusResult, DiffResultTextFile } from 'simple-git';

export interface GitStatus {
  branch: string;
  isClean: boolean;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  oldPath?: string;
}

export interface GitDiff {
  files: DiffFile[];
  summary: {
    insertions: number;
    deletions: number;
    filesChanged: number;
  };
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  content: string;
}

export interface CommitResult {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export class GitHandler {
  private workspacePath: string;
  private git: SimpleGit;

  constructor(workspacePath: string = '/workspace') {
    this.workspacePath = workspacePath;
    this.git = simpleGit(workspacePath);
  }

  /**
   * Get current git status
   */
  async getStatus(): Promise<GitStatus> {
    const status: StatusResult = await this.git.status();

    const staged: FileChange[] = [];
    const unstaged: FileChange[] = [];

    // Process staged files
    for (const file of status.staged) {
      staged.push({
        path: file,
        status: this.getFileStatus(status, file, true),
      });
    }

    // Process modified (unstaged) files
    for (const file of status.modified) {
      if (!status.staged.includes(file)) {
        unstaged.push({
          path: file,
          status: 'modified',
        });
      }
    }

    // Process deleted files
    for (const file of status.deleted) {
      if (!status.staged.includes(file)) {
        unstaged.push({
          path: file,
          status: 'deleted',
        });
      }
    }

    // Process renamed files
    for (const rename of status.renamed) {
      if (status.staged.includes(rename.to)) {
        // Already counted in staged
        const idx = staged.findIndex(f => f.path === rename.to);
        if (idx >= 0) {
          staged[idx].status = 'renamed';
          staged[idx].oldPath = rename.from;
        }
      }
    }

    return {
      branch: status.current || 'unknown',
      isClean: status.isClean(),
      staged,
      unstaged,
      untracked: status.not_added,
    };
  }

  /**
   * Get file status from status result
   */
  private getFileStatus(status: StatusResult, file: string, staged: boolean): FileChange['status'] {
    if (status.created.includes(file)) return 'added';
    if (status.deleted.includes(file)) return 'deleted';
    if (status.renamed.some(r => r.to === file)) return 'renamed';
    return 'modified';
  }

  /**
   * Get diff for files
   */
  async getDiff(options: { staged?: boolean; files?: string[] } = {}): Promise<GitDiff> {
    const args: string[] = [];

    if (options.staged) {
      args.push('--cached');
    }

    if (options.files && options.files.length > 0) {
      args.push('--');
      args.push(...options.files);
    }

    // Get unified diff content
    const diffContent = await this.git.diff(args);

    // Get diff stats
    const diffSummary = await this.git.diffSummary(args);

    const files: DiffFile[] = [];

    // Parse diff content to extract per-file diffs
    const fileDiffs = this.parseDiffContent(diffContent);

    for (const file of diffSummary.files) {
      // Type guard: only text files have insertions/deletions
      const isTextFile = (f: typeof file): f is DiffResultTextFile =>
        'insertions' in f && 'deletions' in f;

      files.push({
        path: file.file,
        additions: isTextFile(file) ? file.insertions : 0,
        deletions: isTextFile(file) ? file.deletions : 0,
        content: fileDiffs[file.file] || '',
      });
    }

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
   * Parse unified diff content into per-file diffs
   */
  private parseDiffContent(diff: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!diff) return result;

    // Split by file headers (diff --git a/... b/...)
    const filePattern = /^diff --git a\/(.*?) b\/.*$/gm;
    const parts = diff.split(filePattern);

    for (let i = 1; i < parts.length; i += 2) {
      const filename = parts[i];
      const content = parts[i + 1] || '';
      result[filename] = `diff --git a/${filename} b/${filename}${content}`;
    }

    return result;
  }

  /**
   * Stage files
   */
  async stageFiles(files: string[]): Promise<void> {
    if (files.length === 0) {
      // Stage all
      await this.git.add('-A');
    } else {
      await this.git.add(files);
    }
  }

  /**
   * Unstage files
   */
  async unstageFiles(files: string[]): Promise<void> {
    if (files.length === 0) {
      // Unstage all
      await this.git.reset(['HEAD']);
    } else {
      await this.git.reset(['HEAD', '--', ...files]);
    }
  }

  /**
   * Commit staged changes
   */
  async commit(message: string): Promise<CommitResult> {
    const result = await this.git.commit(message);

    // Get commit details
    const log = await this.git.log({ maxCount: 1 });
    const latest = log.latest;

    return {
      hash: result.commit || latest?.hash || '',
      message: message,
      author: latest?.author_name || '',
      date: latest?.date || new Date().toISOString(),
    };
  }

  /**
   * Discard changes to files (revert to HEAD)
   * For tracked files: git checkout -- <files>
   * For untracked files: git clean -f <files>
   */
  async discardChanges(files: string[]): Promise<void> {
    if (files.length === 0) {
      // Discard all changes
      await this.git.checkout(['--', '.']);
      await this.git.clean('f', ['-d']); // Also remove untracked files/dirs
    } else {
      // Get status to determine which files are untracked
      const status = await this.git.status();
      const untrackedSet = new Set(status.not_added);

      const trackedFiles = files.filter(f => !untrackedSet.has(f));
      const untrackedFiles = files.filter(f => untrackedSet.has(f));

      // Checkout tracked files (reverts modifications)
      if (trackedFiles.length > 0) {
        await this.git.checkout(['--', ...trackedFiles]);
      }

      // Clean untracked files
      if (untrackedFiles.length > 0) {
        await this.git.clean('f', untrackedFiles);
      }
    }
  }

  /**
   * Check if the workspace is a git repository
   */
  async isGitRepo(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }
}

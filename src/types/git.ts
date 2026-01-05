export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
}

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
  oldPath?: string; // For renames
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
  content: string; // Unified diff content
}

export interface CommitResult {
  hash: string;
  message: string;
  author: string;
  date: Date;
}

// Agent communication types

export interface GitStatusRequest {
  requestId: string;
}

export interface GitDiffRequest {
  requestId: string;
  staged?: boolean;
  files?: string[];
}

export interface GitStageRequest {
  requestId: string;
  files: string[]; // Empty array = stage all
}

export interface GitUnstageRequest {
  requestId: string;
  files: string[];
}

export interface GitCommitRequest {
  requestId: string;
  message: string;
}

export interface GitOperationResponse<T = unknown> {
  requestId: string;
  success: boolean;
  data?: T;
  error?: string;
}

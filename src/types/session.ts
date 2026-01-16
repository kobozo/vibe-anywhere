import type { SessionStatus, ContainerStatus } from '@/lib/db/schema';

export interface SessionInfo {
  id: string;
  name: string;
  description: string | null;
  status: SessionStatus;
  containerStatus: ContainerStatus;
  repoPath: string; // Path to the git repository
  branchName: string;
  worktreePath: string | null;
  claudeCommand: string[] | null; // Custom Claude CLI command (e.g., ['claude', '-p', 'my prompt'])
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
}

export interface CreateSessionInput {
  name: string;
  description?: string;
  repoPath: string; // Path to the git repository to work in
  branchName?: string; // If not provided, auto-generated
  claudeCommand?: string[]; // Custom Claude CLI command (default: ['claude'])
}

export interface SessionAttachment {
  sessionId: string;
  wsUrl: string;
  outputBuffer: string[];
}

export interface SessionWithUser extends SessionInfo {
  userId: string;
  user: {
    id: string;
    username: string;
  };
}

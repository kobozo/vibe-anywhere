/**
 * Remote Git Service
 * Fetches branch information from remote repositories using git ls-remote
 * without requiring a local clone.
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { getSSHKeyService } from './ssh-key-service';

export interface RemoteBranchInfo {
  branches: string[];
  defaultBranch: string | null;
}

export interface FetchBranchesOptions {
  repoUrl: string;
  sshKeyId?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30000;

export class RemoteGitService {
  private tempDir: string;

  constructor() {
    // Use /tmp for temporary SSH key files
    this.tempDir = '/tmp/vibe-anywhere-git';
  }

  /**
   * Ensure the temp directory exists
   */
  private async ensureTempDir(): Promise<void> {
    await fs.mkdir(this.tempDir, { recursive: true, mode: 0o700 });
  }

  /**
   * Fetch branches from a remote repository
   */
  async fetchRemoteBranches(options: FetchBranchesOptions): Promise<RemoteBranchInfo> {
    const { repoUrl, sshKeyId, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
    let tempKeyPath: string | null = null;

    try {
      // If SSH key provided, write it to temp file
      if (sshKeyId) {
        tempKeyPath = await this.writeTempKey(sshKeyId);
      }

      // Execute git ls-remote
      const output = await this.execGitLsRemote(repoUrl, tempKeyPath, timeoutMs);

      // Parse output
      return this.parseLsRemoteOutput(output);
    } finally {
      // Clean up temp key file
      if (tempKeyPath) {
        try {
          await fs.unlink(tempKeyPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Write SSH private key to a temporary file
   */
  private async writeTempKey(sshKeyId: string): Promise<string> {
    await this.ensureTempDir();

    const sshKeyService = getSSHKeyService();
    const privateKey = await sshKeyService.getDecryptedPrivateKey(sshKeyId);

    const tempPath = path.join(this.tempDir, `key_${crypto.randomUUID()}`);
    await fs.writeFile(tempPath, privateKey, { mode: 0o600 });

    return tempPath;
  }

  /**
   * Execute git ls-remote command
   */
  private execGitLsRemote(
    repoUrl: string,
    sshKeyPath: string | null,
    timeoutMs: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env };

      // Configure SSH command for private key and host key checking
      if (sshKeyPath) {
        env.GIT_SSH_COMMAND = `ssh -i "${sshKeyPath}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes`;
      } else {
        // For HTTPS repos, still disable host key checking prompts
        env.GIT_SSH_COMMAND = 'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes';
      }

      // Disable interactive prompts
      env.GIT_TERMINAL_PROMPT = '0';

      const args = ['ls-remote', '--heads', '--symref', repoUrl];
      const proc = spawn('git', args, { env, timeout: timeoutMs });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Set up timeout
      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`git ls-remote timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          resolve(stdout);
        } else {
          // Check for common error patterns
          const errorMsg = stderr.toLowerCase();
          if (errorMsg.includes('permission denied') || errorMsg.includes('authentication failed')) {
            reject(new Error('SSH authentication failed. Check that the SSH key is correct and has access to the repository.'));
          } else if (errorMsg.includes('repository not found') || errorMsg.includes('not found')) {
            reject(new Error('Repository not found. Check the URL and ensure you have access.'));
          } else if (errorMsg.includes('could not resolve host')) {
            reject(new Error('Could not resolve host. Check your network connection and the repository URL.'));
          } else {
            reject(new Error(`git ls-remote failed (code ${code}): ${stderr || 'Unknown error'}`));
          }
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn git: ${err.message}`));
      });
    });
  }

  /**
   * Parse git ls-remote output to extract branches and default branch
   *
   * Example output with --symref:
   * ref: refs/heads/main	HEAD
   * abc123def456...	HEAD
   * abc123def456...	refs/heads/main
   * def456ghi789...	refs/heads/develop
   * ghi789jkl012...	refs/heads/feature/foo
   */
  private parseLsRemoteOutput(output: string): RemoteBranchInfo {
    const branches: string[] = [];
    let defaultBranch: string | null = null;

    const lines = output.split('\n').filter(line => line.trim());

    for (const line of lines) {
      // Parse symref for default branch: "ref: refs/heads/main	HEAD"
      const symrefMatch = line.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD$/);
      if (symrefMatch) {
        defaultBranch = symrefMatch[1];
        continue;
      }

      // Parse branch refs: "abc123...	refs/heads/feature/foo"
      const branchMatch = line.match(/^\S+\s+refs\/heads\/(.+)$/);
      if (branchMatch) {
        branches.push(branchMatch[1]);
      }
    }

    // Sort branches alphabetically, but put default branch first if detected
    branches.sort((a, b) => {
      if (a === defaultBranch) return -1;
      if (b === defaultBranch) return 1;
      // Put common main branches early
      const priority = ['main', 'master', 'develop', 'dev'];
      const aIdx = priority.indexOf(a);
      const bIdx = priority.indexOf(b);
      if (aIdx !== -1 && bIdx === -1) return -1;
      if (bIdx !== -1 && aIdx === -1) return 1;
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      return a.localeCompare(b);
    });

    return { branches, defaultBranch };
  }
}

// Singleton instance
let remoteGitServiceInstance: RemoteGitService | null = null;

export function getRemoteGitService(): RemoteGitService {
  if (!remoteGitServiceInstance) {
    remoteGitServiceInstance = new RemoteGitService();
  }
  return remoteGitServiceInstance;
}

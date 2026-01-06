import { Client as SSHClient, ClientChannel } from 'ssh2';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Duplex, PassThrough } from 'stream';
import { spawn } from 'child_process';
import { config } from '@/lib/config';
import type { ContainerStream } from '../interfaces';

/**
 * SSH connection options
 */
export interface SSHConnectionOptions {
  host: string;
  port?: number;
  username?: string;
  privateKeyPath?: string;
  password?: string;
}

/**
 * Create a duplex stream wrapper around SSH channel
 * This makes the SSH channel compatible with the ContainerStream interface
 */
class SSHDuplexStream extends Duplex {
  private channel: ClientChannel;

  constructor(channel: ClientChannel) {
    super();
    this.channel = channel;

    // Forward data from channel to this stream
    channel.on('data', (data: Buffer) => {
      this.push(data);
    });

    channel.stderr.on('data', (data: Buffer) => {
      this.push(data);
    });

    channel.on('close', () => {
      this.push(null); // Signal EOF
    });

    channel.on('error', (err: Error) => {
      this.destroy(err);
    });
  }

  _read(): void {
    // Reading is handled by the channel events above
  }

  _write(chunk: Buffer, encoding: string, callback: (error?: Error | null) => void): void {
    try {
      this.channel.write(chunk, encoding as BufferEncoding, callback);
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  _final(callback: (error?: Error | null) => void): void {
    this.channel.end();
    callback();
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.channel.close();
    callback(error);
  }
}

/**
 * Create an SSH connection to a container
 */
export async function createSSHConnection(options: SSHConnectionOptions): Promise<SSHClient> {
  const ssh = new SSHClient();
  const CONNECTION_TIMEOUT = 30000; // 30 second timeout

  return new Promise((resolve, reject) => {
    const cfg = config.proxmox;

    // Set up connection timeout
    const timeout = setTimeout(() => {
      ssh.end();
      reject(new Error(`SSH connection to ${options.host} timed out after ${CONNECTION_TIMEOUT}ms`));
    }, CONNECTION_TIMEOUT);

    // Determine authentication method
    let authOptions: {
      host: string;
      port: number;
      username: string;
      privateKey?: Buffer;
      password?: string;
      readyTimeout?: number;
    } = {
      host: options.host,
      port: options.port || 22,
      username: options.username || cfg.sshUser || 'root',
      readyTimeout: CONNECTION_TIMEOUT,
    };

    // Try private key authentication - prioritize ed25519 over rsa
    const keyLocations = [
      options.privateKeyPath,
      cfg.sshPrivateKeyPath,
      path.join(os.homedir(), '.ssh', 'id_ed25519'),
      path.join(os.homedir(), '.ssh', 'id_ecdsa'),
      path.join(os.homedir(), '.ssh', 'id_rsa'),
    ].filter(Boolean) as string[];

    for (const keyPath of keyLocations) {
      if (fs.existsSync(keyPath)) {
        authOptions.privateKey = fs.readFileSync(keyPath);
        break;
      }
    }

    if (!authOptions.privateKey && options.password) {
      authOptions.password = options.password;
    }

    if (!authOptions.privateKey && !authOptions.password) {
      clearTimeout(timeout);
      reject(new Error('No SSH private key found and no password provided'));
      return;
    }

    ssh.on('ready', () => {
      clearTimeout(timeout);
      resolve(ssh);
    });

    ssh.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ssh.connect(authOptions);
  });
}

/**
 * Create an interactive PTY session over SSH
 * Returns a ContainerStream compatible with the rest of the system
 */
export async function createSSHStream(
  connectionOptions: SSHConnectionOptions,
  shellOptions: {
    cols?: number;
    rows?: number;
    workingDir?: string;
    command?: string[];
    env?: Record<string, string>;
  } = {}
): Promise<ContainerStream & { ssh: SSHClient }> {
  const ssh = await createSSHConnection(connectionOptions);

  return new Promise((resolve, reject) => {
    const { cols = 80, rows = 24, workingDir = '/workspace', command, env = {} } = shellOptions;

    // If a command is provided, execute it; otherwise start a shell
    if (command && command.length > 0) {
      // Execute specific command
      const cmdString = command.map(arg => {
        // Quote arguments that contain spaces or special characters
        if (/[\s"'\\]/.test(arg)) {
          return `"${arg.replace(/["\\]/g, '\\$&')}"`;
        }
        return arg;
      }).join(' ');

      // Build env string for export commands (SSH doesn't support env directly in exec)
      const envExports = Object.entries({
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...env,
      }).map(([k, v]) => `export ${k}="${v}"`).join('; ');

      const fullCommand = `${envExports}; cd ${workingDir} && ${cmdString}`;

      ssh.exec(fullCommand, {
        pty: {
          cols,
          rows,
          term: 'xterm-256color',
        },
      }, (err, channel) => {
        if (err) {
          ssh.end();
          reject(err);
          return;
        }

        const stream = new SSHDuplexStream(channel);

        resolve({
          stream: stream as unknown as Duplex,
          ssh,
          close: async () => {
            channel.close();
            ssh.end();
          },
          resize: async (newCols: number, newRows: number) => {
            channel.setWindow(newRows, newCols, 0, 0);
          },
        });
      });
    } else {
      // Start interactive shell
      ssh.shell({
        cols,
        rows,
        term: 'xterm-256color',
      }, (err, channel) => {
        if (err) {
          ssh.end();
          reject(err);
          return;
        }

        // Set environment and change to working directory
        const envExports = Object.entries({
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          ...env,
        }).map(([k, v]) => `export ${k}="${v}"`).join('; ');

        channel.write(`${envExports}; cd ${workingDir}; clear\n`);

        const stream = new SSHDuplexStream(channel);

        resolve({
          stream: stream as unknown as Duplex,
          ssh,
          close: async () => {
            channel.close();
            ssh.end();
          },
          resize: async (newCols: number, newRows: number) => {
            channel.setWindow(newRows, newCols, 0, 0);
          },
        });
      });
    }
  });
}

/**
 * Execute a command over SSH and return the result
 * Used for non-interactive command execution
 */
export async function execSSHCommand(
  connectionOptions: SSHConnectionOptions,
  command: string[],
  options: {
    workingDir?: string;
    env?: Record<string, string>;
    onOutput?: (type: 'stdout' | 'stderr', data: string) => void;
  } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const ssh = await createSSHConnection(connectionOptions);
  const { workingDir = '/workspace', env = {}, onOutput } = options;

  return new Promise((resolve, reject) => {
    const cmdString = command.map(arg => {
      if (/[\s"'\\]/.test(arg)) {
        return `"${arg.replace(/["\\]/g, '\\$&')}"`;
      }
      return arg;
    }).join(' ');

    const fullCommand = `cd ${workingDir} && ${cmdString}`;

    // Build environment string
    const envString = Object.entries(env)
      .map(([k, v]) => `export ${k}="${v}"`)
      .join('; ');

    const execCommand = envString ? `${envString}; ${fullCommand}` : fullCommand;

    ssh.exec(execCommand, (err, channel) => {
      if (err) {
        ssh.end();
        reject(err);
        return;
      }

      let stdout = '';
      let stderr = '';

      channel.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        onOutput?.('stdout', text);
      });

      channel.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        onOutput?.('stderr', text);
      });

      channel.on('close', (code: number) => {
        ssh.end();
        resolve({
          exitCode: code || 0,
          stdout,
          stderr,
        });
      });

      channel.on('error', (channelErr: Error) => {
        ssh.end();
        reject(channelErr);
      });
    });
  });
}

/**
 * Sync workspace files to a container using rsync over SSH
 * This is used for Proxmox LXC containers where bind mounts aren't available
 */
export async function syncWorkspaceToContainer(
  localPath: string,
  containerIp: string,
  remotePath: string = '/workspace',
  options: {
    username?: string;
    privateKeyPath?: string;
    delete?: boolean;  // Delete files in dest that don't exist in source
    chownUser?: string;  // User to chown files to after sync
  } = {}
): Promise<void> {
  const cfg = config.proxmox;
  const username = options.username || cfg.sshUser || 'root';
  // The workspace user - files should be owned by this user (default: kobozo)
  const chownUser = options.chownUser || 'kobozo';

  // Find SSH private key
  let privateKeyPath = options.privateKeyPath || cfg.sshPrivateKeyPath;
  if (!privateKeyPath) {
    const keyLocations = [
      path.join(os.homedir(), '.ssh', 'id_ed25519'),
      path.join(os.homedir(), '.ssh', 'id_rsa'),
      path.join(os.homedir(), '.ssh', 'id_ecdsa'),
    ];
    for (const keyPath of keyLocations) {
      if (fs.existsSync(keyPath)) {
        privateKeyPath = keyPath;
        break;
      }
    }
  }

  if (!privateKeyPath || !fs.existsSync(privateKeyPath)) {
    throw new Error('No SSH private key found for rsync');
  }

  // Ensure local path exists
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local workspace path does not exist: ${localPath}`);
  }

  // Build rsync command
  const rsyncArgs = [
    '-avz',                           // Archive, verbose, compress
    '--progress',                     // Show progress
    '-e', `ssh -i ${privateKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`,
    `${localPath}/`,                  // Source (trailing slash = contents only)
    `${username}@${containerIp}:${remotePath}/`,  // Destination
  ];

  if (options.delete) {
    rsyncArgs.splice(1, 0, '--delete');  // Add --delete after -avz
  }

  console.log(`Syncing workspace: ${localPath} -> ${username}@${containerIp}:${remotePath}`);

  return new Promise((resolve, reject) => {
    const rsync = spawn('rsync', rsyncArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    rsync.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    rsync.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    rsync.on('close', async (code) => {
      if (code === 0) {
        console.log(`Workspace sync completed successfully`);

        // Chown the workspace to the target user
        try {
          console.log(`Setting ownership of ${remotePath} to ${chownUser}...`);
          const chownCmd = `chown -R ${chownUser}:${chownUser} ${remotePath}`;
          const sshArgs = [
            '-i', privateKeyPath!,
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'UserKnownHostsFile=/dev/null',
            `${username}@${containerIp}`,
            chownCmd,
          ];

          await new Promise<void>((chownResolve, chownReject) => {
            const ssh = spawn('ssh', sshArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
            let chownStderr = '';

            ssh.stderr.on('data', (data) => {
              chownStderr += data.toString();
            });

            ssh.on('close', (chownCode) => {
              if (chownCode === 0) {
                console.log(`Ownership set to ${chownUser} successfully`);
                chownResolve();
              } else {
                console.error(`chown failed with code ${chownCode}: ${chownStderr}`);
                chownReject(new Error(`chown failed with code ${chownCode}: ${chownStderr}`));
              }
            });

            ssh.on('error', (err) => {
              chownReject(new Error(`Failed to run chown: ${err.message}`));
            });
          });

          resolve();
        } catch (chownErr) {
          // Log but don't fail the sync - permissions might still work
          console.error('Warning: Failed to set ownership:', chownErr);
          resolve();
        }
      } else {
        console.error(`rsync failed with code ${code}: ${stderr}`);
        reject(new Error(`rsync failed with code ${code}: ${stderr}`));
      }
    });

    rsync.on('error', (err) => {
      reject(new Error(`Failed to spawn rsync: ${err.message}`));
    });
  });
}

/**
 * Sync SSH keys to a container for git operations
 * Creates ~/.ssh directory and writes the private key with proper permissions
 */
export async function syncSSHKeyToContainer(
  containerIp: string,
  privateKey: string,
  keyName: string = 'id_ed25519',
  options: {
    username?: string;
    privateKeyPath?: string;
    targetUser?: string;  // User whose home directory to put the key in
  } = {}
): Promise<void> {
  const cfg = config.proxmox;
  // Always connect as root for system operations
  const connectUser = 'root';
  // Target user for SSH key (whose home dir to put it in)
  const targetUser = options.targetUser || cfg.sshUser || 'kobozo';

  // Find SSH private key for our connection
  let hostPrivateKeyPath = options.privateKeyPath || cfg.sshPrivateKeyPath;
  if (!hostPrivateKeyPath) {
    const keyLocations = [
      path.join(os.homedir(), '.ssh', 'id_ed25519'),
      path.join(os.homedir(), '.ssh', 'id_rsa'),
      path.join(os.homedir(), '.ssh', 'id_ecdsa'),
    ];
    for (const keyPath of keyLocations) {
      if (fs.existsSync(keyPath)) {
        hostPrivateKeyPath = keyPath;
        break;
      }
    }
  }

  if (!hostPrivateKeyPath || !fs.existsSync(hostPrivateKeyPath)) {
    throw new Error('No SSH private key found for connection to container');
  }

  console.log(`Syncing SSH key '${keyName}' to container ${containerIp} for user ${targetUser}`);
  console.log(`Using host key: ${hostPrivateKeyPath}, connecting as ${connectUser}`);

  // Connect to container as root for system operations
  const ssh = await createSSHConnection({ host: containerIp, username: connectUser });
  console.log('SSH connection established, executing setup script...');

  try {
    // Create SSH directory for target user, write key, set permissions, and configure git
    // Use absolute paths since we're connecting as root
    const targetHome = targetUser === 'root' ? '/root' : `/home/${targetUser}`;
    const setupScript = `
      mkdir -p ${targetHome}/.ssh
      chmod 700 ${targetHome}/.ssh
      cat > ${targetHome}/.ssh/${keyName} << 'SSHKEY'
${privateKey}
SSHKEY
      chmod 600 ${targetHome}/.ssh/${keyName}

      # Create SSH config to use this key for git
      cat > ${targetHome}/.ssh/config << 'SSHCONFIG'
Host *
  IdentityFile ~/.ssh/${keyName}
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
SSHCONFIG
      chmod 600 ${targetHome}/.ssh/config

      # Set ownership to target user
      chown -R ${targetUser}:${targetUser} ${targetHome}/.ssh

      # Configure git for target user
      su - ${targetUser} -c "git config --global core.sshCommand 'ssh -i ~/.ssh/${keyName} -o StrictHostKeyChecking=no'"
      su - ${targetUser} -c "git config --global --add safe.directory /workspace"
    `;

    const EXEC_TIMEOUT = 30000; // 30 second timeout for command execution
    await new Promise<void>((resolve, reject) => {
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`SSH key setup timed out after ${EXEC_TIMEOUT}ms`));
        }
      }, EXEC_TIMEOUT);

      ssh.exec(setupScript, (err, channel) => {
        if (err) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            reject(err);
          }
          return;
        }

        let stderr = '';
        channel.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        channel.on('close', (code: number) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            if (code === 0) {
              console.log(`SSH key '${keyName}' synced to container ${containerIp}`);
              resolve();
            } else {
              reject(new Error(`SSH key setup failed with code ${code}: ${stderr}`));
            }
          }
        });

        channel.on('error', (err: Error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            reject(err);
          }
        });
      });
    });
  } finally {
    ssh.end();
  }
}

/**
 * Options for git clone in container
 */
export interface GitCloneOptions {
  url: string;
  branch: string;
  depth?: number;      // undefined = full clone, positive int = shallow clone depth
  sshKeyContent?: string;
}

/**
 * Git status result from inside a container
 */
export interface GitStatusResult {
  hasChanges: boolean;
  staged: number;
  modified: number;
  untracked: number;
}

/**
 * Clone a git repository into a container and checkout a specific branch
 * Used for Proxmox containers - direct clone instead of syncing worktrees
 */
export async function gitCloneInContainer(
  containerIp: string,
  options: GitCloneOptions,
  remotePath: string = '/workspace',
): Promise<void> {
  const { url, branch, depth, sshKeyContent } = options;
  const cfg = config.proxmox;
  // Always use 'kobozo' as the workspace user - sshUser is for the connection, not the workspace owner
  const workspaceUser = 'kobozo';

  const depthStr = depth ? ` (depth: ${depth})` : ' (full)';
  console.log(`Cloning ${url} (branch: ${branch}${depthStr}) to ${containerIp}:${remotePath}`);

  // Connect as root for setup operations
  const ssh = await createSSHConnection({ host: containerIp, username: 'root' });

  try {
    // Setup SSH key if provided (for private repos)
    let sshSetupScript = '';
    if (sshKeyContent) {
      sshSetupScript = `
        # Setup SSH key for workspace user
        mkdir -p /home/${workspaceUser}/.ssh
        cat > /home/${workspaceUser}/.ssh/id_ed25519 << 'SSHKEY'
${sshKeyContent}
SSHKEY
        chmod 600 /home/${workspaceUser}/.ssh/id_ed25519
        cat > /home/${workspaceUser}/.ssh/config << 'SSHCONFIG'
Host *
  IdentityFile ~/.ssh/id_ed25519
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
SSHCONFIG
        chmod 600 /home/${workspaceUser}/.ssh/config
        chown -R ${workspaceUser}:${workspaceUser} /home/${workspaceUser}/.ssh
      `;
    }

    // Build clone command with depth option
    const depthArg = depth ? `--depth ${depth} --single-branch` : '';
    const cloneScript = `
      set -e  # Exit on any error

      ${sshSetupScript}

      # Verify SSH key was set up
      if [ -f /home/${workspaceUser}/.ssh/id_ed25519 ]; then
        echo "SSH key installed for ${workspaceUser}"
      else
        echo "WARNING: No SSH key found"
      fi

      # Ensure workspace directory is clean and owned by workspace user
      rm -rf ${remotePath}
      mkdir -p ${remotePath}
      chown ${workspaceUser}:${workspaceUser} ${remotePath}

      # Clone as workspace user
      su - ${workspaceUser} -c "
        cd /
        export GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
        echo 'Attempting git clone...'
        if git clone ${depthArg} --branch ${branch} '${url}' '${remotePath}' 2>&1; then
          echo 'Clone succeeded with branch flag'
        elif git clone ${depthArg} '${url}' '${remotePath}' 2>&1; then
          echo 'Clone succeeded without branch flag'
        else
          echo 'Clone FAILED'
          exit 1
        fi

        cd '${remotePath}'
        git checkout ${branch} 2>/dev/null || git checkout -b ${branch}

        git config --global --add safe.directory '${remotePath}'
        git config user.email 'claude@session-hub.local'
        git config user.name 'Claude (Session Hub)'
      "

      # Ensure proper ownership
      chown -R ${workspaceUser}:${workspaceUser} ${remotePath}

      # Verify clone worked
      if [ -d "${remotePath}/.git" ]; then
        echo "Clone completed successfully"
      else
        echo "Clone FAILED - no .git directory"
        exit 1
      fi
    `;

    await new Promise<void>((resolve, reject) => {
      ssh.exec(cloneScript, (err, channel) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        channel.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        channel.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        channel.on('close', (code: number) => {
          // Log full output for debugging
          console.log(`Clone script output:\n${stdout}`);
          if (stderr) console.log(`Clone script stderr:\n${stderr}`);

          if (code === 0 && stdout.includes('Clone completed successfully')) {
            console.log(`Repository cloned to ${containerIp}:${remotePath}`);
            resolve();
          } else {
            console.error(`Clone failed with code ${code}`);
            reject(new Error(`Git clone failed with code ${code}: ${stderr || stdout}`));
          }
        });

        channel.on('error', reject);
      });
    });
  } finally {
    ssh.end();
  }
}

/**
 * Get git status from inside a container
 * Used to check for uncommitted changes before destroying a container
 */
export async function getGitStatusInContainer(
  containerIp: string,
  remotePath: string = '/workspace',
): Promise<GitStatusResult> {
  // Connect as root but run commands as kobozo (the workspace owner)
  const workspaceUser = 'kobozo';

  const ssh = await createSSHConnection({ host: containerIp, username: 'root' });

  try {
    const statusScript = `
      cd ${remotePath} 2>/dev/null || exit 1
      staged=$(git diff --cached --numstat 2>/dev/null | wc -l)
      modified=$(git diff --numstat 2>/dev/null | wc -l)
      untracked=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l)
      echo "$staged $modified $untracked"
    `;

    const result = await new Promise<string>((resolve, reject) => {
      ssh.exec(statusScript, (err, channel) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        channel.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        channel.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        channel.on('close', (code: number) => {
          if (code === 0) {
            resolve(stdout.trim());
          } else {
            // If git status fails (e.g., not a git repo), return zeros
            console.warn(`Git status check failed: ${stderr}`);
            resolve('0 0 0');
          }
        });

        channel.on('error', reject);
      });
    });

    const [staged, modified, untracked] = result.split(' ').map(n => parseInt(n, 10) || 0);
    const hasChanges = staged > 0 || modified > 0 || untracked > 0;

    return { hasChanges, staged, modified, untracked };
  } finally {
    ssh.end();
  }
}

/**
 * Check if a git repository exists at the given path in a container
 */
export async function isRepoClonedInContainer(
  containerIp: string,
  remotePath: string = '/workspace',
): Promise<boolean> {
  // Connect as root to check if repo exists
  const ssh = await createSSHConnection({ host: containerIp, username: 'root' });

  try {
    const result = await new Promise<boolean>((resolve) => {
      ssh.exec(`test -d ${remotePath}/.git && echo "exists" || echo "missing"`, (err, channel) => {
        if (err) {
          resolve(false);
          return;
        }

        let stdout = '';
        channel.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        channel.on('close', () => {
          resolve(stdout.trim() === 'exists');
        });

        channel.on('error', () => resolve(false));
      });
    });

    return result;
  } finally {
    ssh.end();
  }
}

/**
 * @deprecated Use gitCloneInContainer instead
 * Clone a git repository into a container and checkout a specific branch
 * Used for Proxmox containers instead of syncing worktrees
 */
export async function cloneRepoInContainer(
  containerIp: string,
  repoUrl: string,
  branchName: string,
  remotePath: string = '/workspace',
  options: {
    username?: string;
    sshKeyContent?: string;  // If provided, set up SSH key for git
  } = {}
): Promise<void> {
  // Delegate to the new function
  return gitCloneInContainer(containerIp, {
    url: repoUrl,
    branch: branchName,
    sshKeyContent: options.sshKeyContent,
  }, remotePath);
}

export async function syncWorkspaceFromContainer(
  containerIp: string,
  remotePath: string,
  localPath: string,
  options: {
    username?: string;
    privateKeyPath?: string;
  } = {}
): Promise<void> {
  const cfg = config.proxmox;
  const username = options.username || cfg.sshUser || 'root';

  // Find SSH private key
  let privateKeyPath = options.privateKeyPath || cfg.sshPrivateKeyPath;
  if (!privateKeyPath) {
    const keyLocations = [
      path.join(os.homedir(), '.ssh', 'id_ed25519'),
      path.join(os.homedir(), '.ssh', 'id_rsa'),
      path.join(os.homedir(), '.ssh', 'id_ecdsa'),
    ];
    for (const keyPath of keyLocations) {
      if (fs.existsSync(keyPath)) {
        privateKeyPath = keyPath;
        break;
      }
    }
  }

  if (!privateKeyPath || !fs.existsSync(privateKeyPath)) {
    throw new Error('No SSH private key found for rsync');
  }

  // Build rsync command (reverse direction)
  const rsyncArgs = [
    '-avz',
    '--progress',
    '-e', `ssh -i ${privateKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`,
    `${username}@${containerIp}:${remotePath}/`,
    `${localPath}/`,
  ];

  console.log(`Syncing workspace back: ${username}@${containerIp}:${remotePath} -> ${localPath}`);

  return new Promise((resolve, reject) => {
    const rsync = spawn('rsync', rsyncArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    rsync.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    rsync.on('close', (code) => {
      if (code === 0) {
        console.log(`Workspace sync back completed successfully`);
        resolve();
      } else {
        console.error(`rsync failed with code ${code}: ${stderr}`);
        reject(new Error(`rsync failed with code ${code}: ${stderr}`));
      }
    });

    rsync.on('error', (err) => {
      reject(new Error(`Failed to spawn rsync: ${err.message}`));
    });
  });
}

/**
 * Setup SSH access to a container via pct exec on the Proxmox host
 * This adds the Session Hub server's SSH public key to the container's authorized_keys
 * Must be called before any SSH-based operations (rsync, agent provisioning)
 */
export async function setupContainerSSHAccess(
  proxmoxHost: string,
  vmid: number,
  options: {
    username?: string;
    privateKeyPath?: string;
  } = {}
): Promise<void> {
  const cfg = config.proxmox;
  const username = options.username || 'root';

  // Find local SSH public key
  const pubKeyLocations = [
    path.join(os.homedir(), '.ssh', 'id_ed25519.pub'),
    path.join(os.homedir(), '.ssh', 'id_rsa.pub'),
    path.join(os.homedir(), '.ssh', 'id_ecdsa.pub'),
  ];

  let publicKey: string | null = null;
  for (const keyPath of pubKeyLocations) {
    if (fs.existsSync(keyPath)) {
      publicKey = fs.readFileSync(keyPath, 'utf-8').trim();
      break;
    }
  }

  if (!publicKey) {
    throw new Error('No SSH public key found. Please generate an SSH key pair.');
  }

  // Find SSH private key for connecting to Proxmox host
  let privateKeyPath = options.privateKeyPath || cfg.sshPrivateKeyPath;
  if (!privateKeyPath) {
    const keyLocations = [
      path.join(os.homedir(), '.ssh', 'id_ed25519'),
      path.join(os.homedir(), '.ssh', 'id_rsa'),
      path.join(os.homedir(), '.ssh', 'id_ecdsa'),
    ];
    for (const keyPath of keyLocations) {
      if (fs.existsSync(keyPath)) {
        privateKeyPath = keyPath;
        break;
      }
    }
  }

  // Build the pct exec command that will run inside the container
  // This sets up SSH keys, installs rsync, creates the kobozo user, and configures tmux
  // Escape the public key for use in bash
  const escapedKey = publicKey.replace(/'/g, "'\\''");
  const pctCommand = `pct exec ${vmid} -- bash -c '
    # Setup SSH for root
    mkdir -p /root/.ssh
    echo "'"${escapedKey}"'" >> /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
    chmod 700 /root/.ssh

    # Install rsync if needed
    if ! command -v rsync &> /dev/null; then
      apt-get update -qq && apt-get install -y -qq rsync
    fi

    # Create kobozo user if not exists
    if ! id kobozo &>/dev/null; then
      useradd -m -s /bin/bash kobozo
      echo "kobozo:changeme" | chpasswd
    fi

    # Always setup SSH for kobozo (even if user already exists in template)
    mkdir -p /home/kobozo/.ssh
    # Add key if not already present
    grep -qF "'"${escapedKey}"'" /home/kobozo/.ssh/authorized_keys 2>/dev/null || echo "'"${escapedKey}"'" >> /home/kobozo/.ssh/authorized_keys
    chmod 600 /home/kobozo/.ssh/authorized_keys
    chmod 700 /home/kobozo/.ssh
    chown -R kobozo:kobozo /home/kobozo/.ssh

    # Configure tmux to disable mouse mode (allows browser text selection)
    cat > /etc/tmux.conf << TMUXEOF
# Session Hub tmux configuration
# Disable mouse mode to allow browser text selection
set -g mouse off

# Better terminal colors
set -g default-terminal "xterm-256color"
set -ga terminal-overrides ",xterm-256color:Tc"

# Increase scrollback buffer
set -g history-limit 50000

# No delay for escape key
set -sg escape-time 0

# Start window numbering at 1
set -g base-index 1
setw -g pane-base-index 1
TMUXEOF
    chmod 644 /etc/tmux.conf
  '`;

  console.log(`Setting up SSH access for container ${vmid} via Proxmox host ${proxmoxHost}`);

  // Build SSH command args
  const sshArgs = [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'PasswordAuthentication=no',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
  ];

  if (privateKeyPath) {
    sshArgs.push('-i', privateKeyPath);
  }

  sshArgs.push(`${username}@${proxmoxHost}`, pctCommand);

  return new Promise((resolve, reject) => {
    const ssh = spawn('ssh', sshArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let stdout = '';

    ssh.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ssh.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ssh.on('close', (code) => {
      if (code === 0) {
        console.log(`SSH access configured for container ${vmid}`);
        resolve();
      } else {
        console.error(`Failed to setup SSH access for container ${vmid}: ${stderr}`);
        reject(new Error(`Failed to setup SSH access: ${stderr}`));
      }
    });

    ssh.on('error', (err) => {
      reject(new Error(`Failed to spawn ssh: ${err.message}`));
    });
  });
}

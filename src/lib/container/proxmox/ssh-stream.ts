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
  } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const ssh = await createSSHConnection(connectionOptions);
  const { workingDir = '/workspace', env = {} } = options;

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
        stdout += data.toString();
      });

      channel.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
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

    rsync.on('close', (code) => {
      if (code === 0) {
        console.log(`Workspace sync completed successfully`);
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
  } = {}
): Promise<void> {
  const cfg = config.proxmox;
  const username = options.username || cfg.sshUser || 'root';

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

  console.log(`Syncing SSH key '${keyName}' to container ${containerIp}`);

  // Connect to container and setup SSH directory and key
  const ssh = await createSSHConnection({ host: containerIp });

  try {
    // Create ~/.ssh directory, write key, set permissions, and configure git
    const setupScript = `
      mkdir -p ~/.ssh
      chmod 700 ~/.ssh
      cat > ~/.ssh/${keyName} << 'SSHKEY'
${privateKey}
SSHKEY
      chmod 600 ~/.ssh/${keyName}

      # Create SSH config to use this key for git
      cat > ~/.ssh/config << 'SSHCONFIG'
Host *
  IdentityFile ~/.ssh/${keyName}
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
SSHCONFIG
      chmod 600 ~/.ssh/config

      # Configure git to use SSH
      git config --global core.sshCommand "ssh -i ~/.ssh/${keyName} -o StrictHostKeyChecking=no"
    `;

    await new Promise<void>((resolve, reject) => {
      ssh.exec(setupScript, (err, channel) => {
        if (err) {
          reject(err);
          return;
        }

        let stderr = '';
        channel.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        channel.on('close', (code: number) => {
          if (code === 0) {
            console.log(`SSH key '${keyName}' synced to container ${containerIp}`);
            resolve();
          } else {
            reject(new Error(`SSH key setup failed with code ${code}: ${stderr}`));
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
  const cfg = config.proxmox;
  const username = options.username || cfg.sshUser || 'root';

  console.log(`Cloning repo ${repoUrl} (branch: ${branchName}) to ${containerIp}:${remotePath}`);

  const ssh = await createSSHConnection({ host: containerIp });

  try {
    // Setup SSH key if provided
    let setupScript = '';
    if (options.sshKeyContent) {
      setupScript = `
        mkdir -p ~/.ssh
        chmod 700 ~/.ssh
        cat > ~/.ssh/id_ed25519 << 'SSHKEY'
${options.sshKeyContent}
SSHKEY
        chmod 600 ~/.ssh/id_ed25519
        cat > ~/.ssh/config << 'SSHCONFIG'
Host *
  IdentityFile ~/.ssh/id_ed25519
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
SSHCONFIG
        chmod 600 ~/.ssh/config
      `;
    }

    // Clone command
    const cloneScript = `
      ${setupScript}

      # Remove existing workspace if any
      rm -rf ${remotePath}
      mkdir -p ${remotePath}

      # Clone the repo
      GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \\
        git clone --branch ${branchName} ${repoUrl} ${remotePath} || \\
        git clone ${repoUrl} ${remotePath}

      # Checkout branch if clone didn't use it
      cd ${remotePath}
      git checkout ${branchName} 2>/dev/null || git checkout -b ${branchName}

      # Configure git
      git config --global --add safe.directory ${remotePath}
      git config user.email "claude@session-hub.local"
      git config user.name "Claude (Session Hub)"

      echo "Clone completed successfully"
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
          if (code === 0 || stdout.includes('Clone completed successfully')) {
            console.log(`Repo cloned successfully to ${containerIp}:${remotePath}`);
            resolve();
          } else {
            console.error(`Clone failed: ${stderr}`);
            reject(new Error(`Git clone failed with code ${code}: ${stderr}`));
          }
        });

        channel.on('error', reject);
      });
    });
  } finally {
    ssh.end();
  }
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
  // This sets up SSH keys, installs rsync, and creates the kobozo user
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
      mkdir -p /home/kobozo/.ssh
      echo "'"${escapedKey}"'" >> /home/kobozo/.ssh/authorized_keys
      chmod 600 /home/kobozo/.ssh/authorized_keys
      chmod 700 /home/kobozo/.ssh
      chown -R kobozo:kobozo /home/kobozo/.ssh
    fi
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

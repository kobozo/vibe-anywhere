import { Client as SSHClient, ClientChannel } from 'ssh2';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Duplex, PassThrough } from 'stream';
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

    channel.on('error', (err) => {
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

  return new Promise((resolve, reject) => {
    const cfg = config.proxmox;

    // Determine authentication method
    let authOptions: {
      host: string;
      port: number;
      username: string;
      privateKey?: Buffer;
      password?: string;
    } = {
      host: options.host,
      port: options.port || 22,
      username: options.username || cfg.sshUser || 'root',
    };

    // Try private key authentication
    const privateKeyPath = options.privateKeyPath || cfg.sshPrivateKeyPath || path.join(os.homedir(), '.ssh', 'id_rsa');

    if (fs.existsSync(privateKeyPath)) {
      authOptions.privateKey = fs.readFileSync(privateKeyPath);
    } else if (options.password) {
      authOptions.password = options.password;
    } else {
      // Try common key locations
      const keyLocations = [
        path.join(os.homedir(), '.ssh', 'id_ed25519'),
        path.join(os.homedir(), '.ssh', 'id_ecdsa'),
        path.join(os.homedir(), '.ssh', 'id_rsa'),
      ];

      for (const keyPath of keyLocations) {
        if (fs.existsSync(keyPath)) {
          authOptions.privateKey = fs.readFileSync(keyPath);
          break;
        }
      }

      if (!authOptions.privateKey) {
        reject(new Error('No SSH private key found and no password provided'));
        return;
      }
    }

    ssh.on('ready', () => {
      resolve(ssh);
    });

    ssh.on('error', (err) => {
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

      const fullCommand = `cd ${workingDir} && ${cmdString}`;

      ssh.exec(fullCommand, {
        pty: {
          cols,
          rows,
          term: 'xterm-256color',
        },
        env: {
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          ...env,
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
        env: {
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          ...env,
        },
      }, (err, channel) => {
        if (err) {
          ssh.end();
          reject(err);
          return;
        }

        // Change to working directory
        channel.write(`cd ${workingDir}\n`);

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

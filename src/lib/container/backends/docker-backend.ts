import Docker from 'dockerode';
import * as os from 'os';
import * as path from 'path';
import { config } from '@/lib/config';
import type { Duplex } from 'stream';
import type {
  IContainerBackend,
  ContainerConfig,
  ContainerInfo,
  ContainerStream,
  ExecResult,
  ContainerBackendType,
} from '../interfaces';

/**
 * Docker container backend implementation
 * Manages containers using the Docker Engine API via Dockerode
 */
export class DockerBackend implements IContainerBackend {
  readonly backendType: ContainerBackendType = 'docker';

  private docker: Docker;
  private claudeImage: string;
  private hostClaudeConfigPath: string;

  constructor() {
    this.docker = new Docker({ socketPath: config.docker.socketPath });
    this.claudeImage = config.docker.claudeImage;
    this.hostClaudeConfigPath = path.join(os.homedir(), '.claude');
  }

  /**
   * Create a new Docker container for a workspace
   */
  async createContainer(workspaceId: string, containerConfig: ContainerConfig): Promise<string> {
    const { workspacePath, env = {}, memoryLimit, cpuLimit } = containerConfig;

    // Merge environment variables
    const containerEnv: Record<string, string> = {
      ...env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    // Add Anthropic API key if available
    if (config.anthropic.apiKey) {
      containerEnv.ANTHROPIC_API_KEY = config.anthropic.apiKey;
    }

    const container = await this.docker.createContainer({
      name: `session-hub-workspace-${workspaceId}`,
      Image: containerConfig.image || this.claudeImage,
      WorkingDir: '/workspace',
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      Env: Object.entries(containerEnv).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        Binds: [
          `${workspacePath}:/workspace`,
          '/var/run/docker.sock:/var/run/docker.sock',
          `${this.hostClaudeConfigPath}:/home/node/.claude`,
        ],
        Memory: this.parseMemoryLimit(memoryLimit || config.docker.memoryLimit),
        NanoCpus: (cpuLimit || config.docker.cpuLimit) * 1e9,
        AutoRemove: false,
        SecurityOpt: ['no-new-privileges'],
        ReadonlyRootfs: false,
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'SETGID', 'SETUID', 'DAC_OVERRIDE', 'NET_BIND_SERVICE'],
        GroupAdd: ['999'],
      },
      Cmd: ['bash', '-c', 'while true; do sleep 86400; done'],
    });

    return container.id;
  }

  /**
   * Start a container
   */
  async startContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.start();
  }

  /**
   * Stop a container gracefully
   */
  async stopContainer(containerId: string, timeout = 10): Promise<void> {
    const container = this.docker.getContainer(containerId);
    try {
      await container.stop({ t: timeout });
    } catch (error: unknown) {
      if (error instanceof Error && !error.message.includes('container already stopped')) {
        throw error;
      }
    }
  }

  /**
   * Remove a container
   */
  async removeContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    try {
      await container.remove({ force: true, v: true });
    } catch (error: unknown) {
      if (error instanceof Error && !error.message.includes('no such container')) {
        throw error;
      }
    }
  }

  /**
   * Get container status/info
   */
  async getContainerInfo(containerId: string): Promise<ContainerInfo | null> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();

      let status: ContainerInfo['status'] = 'created';
      if (info.State.Running) {
        status = 'running';
      } else if (info.State.Paused) {
        status = 'paused';
      } else if (info.State.Dead) {
        status = 'dead';
      } else if (info.State.ExitCode !== undefined) {
        status = 'exited';
      }

      // Get container IP from networks
      let ipAddress: string | undefined;
      const networks = info.NetworkSettings?.Networks;
      if (networks) {
        const networkName = Object.keys(networks)[0];
        if (networkName) {
          ipAddress = networks[networkName].IPAddress || undefined;
        }
      }

      return {
        id: containerId,
        status,
        startedAt: info.State.StartedAt ? new Date(info.State.StartedAt) : undefined,
        exitCode: info.State.ExitCode,
        ipAddress,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('no such container')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Attach to a running container's TTY
   */
  async attachToContainer(containerId: string): Promise<ContainerStream> {
    const container = this.docker.getContainer(containerId);

    const stream = (await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
      hijack: true,
    })) as Duplex;

    return {
      stream,
      close: async () => {
        stream.end();
      },
      resize: async (cols: number, rows: number) => {
        try {
          await container.resize({ w: cols, h: rows });
        } catch (error) {
          console.error('Failed to resize container TTY:', error);
        }
      },
    };
  }

  /**
   * Execute a command in the container as an interactive session
   */
  async execCommand(containerId: string, command?: string[] | null): Promise<ContainerStream> {
    const container = this.docker.getContainer(containerId);

    const cmd = command && command.length > 0 ? command : ['/bin/bash'];
    console.log('Executing command in container:', containerId, 'cmd:', cmd);

    const exec = await container.exec({
      Cmd: cmd,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      WorkingDir: '/workspace',
      Env: config.anthropic.apiKey ? [`ANTHROPIC_API_KEY=${config.anthropic.apiKey}`] : [],
    });

    const stream = (await exec.start({
      hijack: true,
      stdin: true,
      Tty: true,
    })) as Duplex;

    return {
      stream,
      close: async () => {
        stream.end();
      },
      resize: async (cols: number, rows: number) => {
        try {
          await exec.resize({ w: cols, h: rows });
        } catch (error) {
          console.error('Failed to resize exec TTY:', error);
        }
      },
    };
  }

  /**
   * Execute a command in the container and get the result
   */
  async executeCommand(containerId: string, command: string[]): Promise<ExecResult> {
    const container = this.docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({});

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      this.docker.modem.demuxStream(
        stream,
        {
          write: (chunk: unknown): boolean => {
            stdout += String(chunk);
            return true;
          },
        } as NodeJS.WritableStream,
        {
          write: (chunk: unknown): boolean => {
            stderr += String(chunk);
            return true;
          },
        } as NodeJS.WritableStream
      );

      stream.on('end', async () => {
        const inspectResult = await exec.inspect();
        resolve({
          exitCode: inspectResult.ExitCode || 0,
          stdout,
          stderr,
        });
      });

      stream.on('error', reject);
    });
  }

  /**
   * Check if the Claude Code image exists
   */
  async imageExists(): Promise<boolean> {
    try {
      await this.docker.getImage(this.claudeImage).inspect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure the Claude Code image is available
   */
  async ensureImage(): Promise<void> {
    if (await this.imageExists()) {
      return;
    }

    console.log(`Claude Code image ${this.claudeImage} not found. Please run 'npm run docker:build'`);
    throw new Error(
      `Docker image ${this.claudeImage} not found. Run 'npm run docker:build' to build it.`
    );
  }

  /**
   * Parse memory limit string to bytes
   */
  private parseMemoryLimit(limit: string): number {
    const match = limit.match(/^(\d+)([kmg]?)$/i);
    if (!match) {
      return 2 * 1024 * 1024 * 1024; // Default 2GB
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'k':
        return value * 1024;
      case 'm':
        return value * 1024 * 1024;
      case 'g':
        return value * 1024 * 1024 * 1024;
      default:
        return value;
    }
  }
}

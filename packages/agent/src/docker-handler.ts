/**
 * Docker operations handler for the agent
 * Runs docker commands inside the container workspace
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'created' | 'dead';
  status: string;
  ports: DockerPort[];
  createdAt: string;
}

export interface DockerPort {
  hostPort: number;
  containerPort: number;
  protocol: 'tcp' | 'udp';
  hostIp?: string;
}

export interface DockerStatus {
  containers: DockerContainer[];
}

export class DockerHandler {
  /**
   * Check if Docker is available
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker info', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of all containers with their status and ports
   */
  async getContainers(): Promise<DockerStatus> {
    const format = '{{json .}}';
    const { stdout } = await execAsync(
      `docker ps -a --format '${format}'`,
      { timeout: 10000 }
    );

    const containers: DockerContainer[] = [];
    const lines = stdout.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const raw = JSON.parse(line);
        containers.push({
          id: raw.ID,
          name: raw.Names,
          image: raw.Image,
          state: this.normalizeState(raw.State),
          status: raw.Status,
          ports: this.parsePorts(raw.Ports || ''),
          createdAt: raw.CreatedAt,
        });
      } catch (e) {
        console.error('Failed to parse container info:', e);
      }
    }

    return { containers };
  }

  /**
   * Normalize Docker state to expected values
   */
  private normalizeState(state: string): DockerContainer['state'] {
    const normalized = state?.toLowerCase() || 'dead';
    const validStates = ['running', 'exited', 'paused', 'restarting', 'created', 'dead'];
    return validStates.includes(normalized)
      ? normalized as DockerContainer['state']
      : 'dead';
  }

  /**
   * Parse Docker ports string into structured format
   * Example: "0.0.0.0:3000->3000/tcp, 0.0.0.0:5432->5432/tcp"
   */
  private parsePorts(portsString: string): DockerPort[] {
    if (!portsString) return [];

    const ports: DockerPort[] = [];
    const portMappings = portsString.split(',').map(p => p.trim());

    for (const mapping of portMappings) {
      // Match patterns like "0.0.0.0:3000->3000/tcp" or ":::3000->3000/tcp"
      const match = mapping.match(/(?:(\d+\.\d+\.\d+\.\d+)|:::?):(\d+)->(\d+)\/(tcp|udp)/);
      if (match) {
        ports.push({
          hostIp: match[1] || '0.0.0.0',
          hostPort: parseInt(match[2], 10),
          containerPort: parseInt(match[3], 10),
          protocol: match[4] as 'tcp' | 'udp',
        });
      }
    }

    return ports;
  }

  /**
   * Get logs for a specific container
   */
  async getLogs(containerId: string, tail: number = 100): Promise<string> {
    // Sanitize containerId to prevent command injection
    const sanitizedId = containerId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sanitizedId) {
      throw new Error('Invalid container ID');
    }

    const { stdout } = await execAsync(
      `docker logs --tail ${tail} ${sanitizedId} 2>&1`,
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 } // 10MB max
    );
    return stdout;
  }

  /**
   * Start a stopped container
   */
  async startContainer(containerId: string): Promise<void> {
    const sanitizedId = containerId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sanitizedId) {
      throw new Error('Invalid container ID');
    }
    await execAsync(`docker start ${sanitizedId}`, { timeout: 30000 });
  }

  /**
   * Stop a running container
   */
  async stopContainer(containerId: string): Promise<void> {
    const sanitizedId = containerId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sanitizedId) {
      throw new Error('Invalid container ID');
    }
    await execAsync(`docker stop ${sanitizedId}`, { timeout: 30000 });
  }

  /**
   * Restart a container
   */
  async restartContainer(containerId: string): Promise<void> {
    const sanitizedId = containerId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sanitizedId) {
      throw new Error('Invalid container ID');
    }
    await execAsync(`docker restart ${sanitizedId}`, { timeout: 60000 });
  }
}

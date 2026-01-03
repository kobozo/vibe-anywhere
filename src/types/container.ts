import type { Duplex } from 'stream';

export interface ContainerConfig {
  image: string;
  workspacePath: string;
  env?: Record<string, string>;
  memoryLimit?: string;
  cpuLimit?: number;
}

export interface ContainerInfo {
  id: string;
  status: 'created' | 'running' | 'paused' | 'exited' | 'dead' | 'removing';
  startedAt?: Date;
  exitCode?: number;
}

export interface ContainerStream {
  stream: Duplex;
  close: () => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

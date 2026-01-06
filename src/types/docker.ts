// Docker container info from `docker ps --format json`
export interface DockerContainer {
  id: string;           // Container ID
  name: string;         // Container name
  image: string;        // Image name
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'created' | 'dead';
  status: string;       // Human readable status (e.g., "Up 2 hours")
  ports: DockerPort[];  // Parsed port mappings
  createdAt: string;    // Creation timestamp
}

export interface DockerPort {
  hostPort: number;
  containerPort: number;
  protocol: 'tcp' | 'udp';
  hostIp?: string;      // Usually 0.0.0.0
}

export interface DockerStatus {
  containers: DockerContainer[];
  error?: string;
}

export interface DockerLogs {
  containerId: string;
  logs: string;
  error?: string;
}

// Agent communication types
export interface DockerStatusRequest {
  requestId: string;
}

export interface DockerLogsRequest {
  requestId: string;
  containerId: string;
  tail?: number;        // Number of lines (default: 100)
}

export interface DockerActionRequest {
  requestId: string;
  containerId: string;
}

export interface DockerOperationResponse<T = unknown> {
  requestId: string;
  success: boolean;
  data?: T;
  error?: string;
}

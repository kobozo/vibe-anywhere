---
name: realtime-integration
description: Expert agent for WebSocket server, Socket.io events, state broadcasting, Tailscale integration, and CDP shim management
tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Bash
model: inherit
permissionMode: default
color: yellow
---

# Real-time & Integration Agent

Specialized agent for WebSocket communication, Socket.io event handling, state broadcasting, Tailscale VPN integration, and Chrome DevTools Protocol (CDP) shim management.

## Core Responsibilities

1. **WebSocket Server**: Custom Next.js + Socket.io server
2. **State Broadcasting**: Real-time updates to connected clients
3. **Agent Communication**: `/agent` namespace for sidecar agents
4. **Tailscale Integration**: VPN setup, auth key generation
5. **CDP Shim Management**: Fake chromium binary for remote Chrome access

## Key Files

- `server.ts` - Custom Next.js + Socket.io server
- `src/lib/websocket/server.ts` - Socket.io initialization
- `src/lib/websocket/agent-websocket.ts` - Agent namespace handler
- `src/lib/services/workspace-state-broadcaster.ts` - State broadcasting
- `src/lib/services/tailscale-service.ts` - Tailscale API client
- `src/lib/services/cdp-shim-registry.ts` - CDP shim bundle management

## WebSocket Server Setup

### Custom Server (`server.ts`)
```typescript
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { initializeWebSocketServer } from './src/lib/websocket/server.js';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.io
  const io = new SocketIOServer(server, {
    path: '/socket.io',
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  initializeWebSocketServer(io);

  server.listen(3000, () => {
    console.log('Server ready on http://localhost:3000');
  });
});
```

**Why Custom Server?**
- Next.js 15 doesn't support Socket.io out of the box
- Need persistent WebSocket connections
- Single HTTP server for both Next.js and Socket.io

### Socket.io Initialization
```typescript
// src/lib/websocket/server.ts
import type { Server as SocketIOServer } from 'socket.io';
import { setupAgentWebSocket } from './agent-websocket.js';

export function initializeWebSocketServer(io: SocketIOServer) {
  // Main namespace (for browser clients)
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Agent namespace (for sidecar agents in containers)
  const agentNamespace = io.of('/agent');
  setupAgentWebSocket(agentNamespace);
}
```

## Namespaces

### Main Namespace (`/`)
**Purpose**: Browser clients (web UI)

**Events**:
- `workspace:state` - Workspace status updates
- `container:status` - Container status changes
- `startup:progress` - Startup progress updates
- `tab:output` - Tab output streaming
- `repository:state` - Repository state updates

### Agent Namespace (`/agent`)
**Purpose**: Sidecar agents in containers

**Events**:
- `register` - Agent registration
- `heartbeat` - Keep-alive
- `tab:started` - Tab execution started
- `tab:stopped` - Tab execution stopped
- `tab:output` - Tab output
- `git:status` - Git status update
- `stats` - System stats

## State Broadcasting

### Workspace State Broadcaster
```typescript
// src/lib/services/workspace-state-broadcaster.ts
class WorkspaceStateBroadcaster {
  private io?: Server;

  initialize(io: Server) {
    this.io = io;
  }

  broadcastContainerStatus(
    workspaceId: string,
    containerId: string | null,
    status: ContainerStatus,
    ip: string | null
  ) {
    if (!this.io) return;

    this.io.emit('workspace:state', {
      workspaceId,
      containerId,
      containerStatus: status,
      containerIp: ip,
    });
  }

  broadcastStartupProgress(progress: StartupProgress) {
    if (!this.io) return;

    this.io.emit('startup:progress', progress);
  }

  broadcastAgentConnected(workspaceId: string, version: string) {
    if (!this.io) return;

    this.io.emit('workspace:state', {
      workspaceId,
      agentConnected: true,
      agentVersion: version,
    });
  }
}

let broadcasterInstance: WorkspaceStateBroadcaster | null = null;

export function getWorkspaceStateBroadcaster(): WorkspaceStateBroadcaster {
  if (!broadcasterInstance) {
    broadcasterInstance = new WorkspaceStateBroadcaster();
  }
  return broadcasterInstance;
}
```

**Pattern**: Singleton broadcaster, initialized with Socket.io server

### Repository State Broadcaster
```typescript
// src/lib/services/repository-state-broadcaster.ts
class RepositoryStateBroadcaster {
  broadcastBranchesUpdated(repositoryId: string, branches: string[]) {
    this.io?.emit('repository:state', {
      repositoryId,
      branches,
      cachedAt: new Date().toISOString(),
    });
  }
}
```

## Tailscale Integration

### Purpose
Connect containers to Tailscale VPN for secure remote access and MagicDNS.

### Tailscale Service
```typescript
// src/lib/services/tailscale-service.ts
class TailscaleService {
  private apiKey: string;
  private tailnet: string;

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.tailnet);
  }

  async generateEphemeralAuthKey(tags: string[]): Promise<{ key: string; expiresAt: Date }> {
    const response = await fetch(`https://api.tailscale.com/api/v2/tailnet/${this.tailnet}/keys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        capabilities: {
          devices: {
            create: {
              reusable: false,
              ephemeral: true,
              tags,
            },
          },
        },
        expirySeconds: 3600, // 1 hour
      }),
    });

    const data = await response.json();
    return {
      key: data.key,
      expiresAt: new Date(data.expires),
    };
  }

  async getDevices(): Promise<TailscaleDevice[]> {
    const response = await fetch(`https://api.tailscale.com/api/v2/tailnet/${this.tailnet}/devices`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });

    const data = await response.json();
    return data.devices;
  }
}
```

### Integration Flow
1. **Workspace Starts**: Generate ephemeral auth key
2. **Agent Connects**: Receives `TAILSCALE_AUTHKEY` env var
3. **Tailscale Daemon**: Authenticates with auth key
4. **MagicDNS**: Container gets hostname like `workspace-abc123.tail-net.ts.net`
5. **Agent Reports**: Sends `tailscale:status` event with IP, hostname

### Auth Key Generation
```typescript
// In workspace-service.ts during container startup
const tailscaleService = getTailscaleService();
if (tailscaleService.isConfigured()) {
  const authKey = await tailscaleService.generateEphemeralAuthKey([
    `workspace:${workspaceId}`,
    `repository:${repo.name}`,
  ]);

  mergedEnvVars.TAILSCALE_AUTHKEY = authKey.key;
}
```

## CDP Shim Management

### Purpose
Fake `chromium` binary that proxies Chrome DevTools Protocol commands to a real Chrome browser over Tailscale.

### Use Case
```bash
# In container:
export CHROME_PATH=/usr/local/bin/chromium  # Fake binary
claude # Claude CLI uses CHROME_PATH

# Fake binary proxies CDP to:
ws://chrome-host.tail-net.ts.net:9222/devtools/browser/...
```

### CDP Shim Registry
```typescript
// src/lib/services/cdp-shim-registry.ts
class CdpShimRegistry {
  async getBundleForVersion(version: string): Promise<Buffer> {
    // Download or build CDP shim bundle
    // Returns standalone binary
  }

  async getLatestVersion(): Promise<string> {
    // Check GitHub releases or local storage
    return '1.0.0';
  }
}
```

### Shim Binary
```javascript
#!/usr/bin/env node
// CDP shim - proxies CDP commands to remote Chrome

const CDP_HOST = process.env.CDP_HOST || 'localhost';
const CDP_PORT = process.env.CDP_PORT || 9222;

// Parse --remote-debugging-port and other Chrome flags
// Establish WebSocket connection to real Chrome
// Proxy CDP commands bidirectionally
```

### Installation
```typescript
// In workspace-service.ts
mergedEnvVars.CHROME_PATH = '/usr/local/bin/chromium';
mergedEnvVars.CDP_HOST = 'chrome-host.tail-net.ts.net';
mergedEnvVars.CDP_PORT = '9222';

// Binary installed during agent provisioning
await execSSHCommand(
  { host: containerIp, username: 'root' },
  ['curl', '-fSL', '-o', '/usr/local/bin/chromium', `${sessionHubUrl}/api/cdp-shim/bundle`]
);
await execSSHCommand(
  { host: containerIp, username: 'root' },
  ['chmod', '+x', '/usr/local/bin/chromium']
);
```

## File Upload Handling

### Purpose
Upload files to containers (SSH keys, configuration files, etc.)

### Pattern
```typescript
// API route
export const POST = withErrorHandling(async (request: NextRequest) => {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  const buffer = Buffer.from(await file.arrayBuffer());

  // Write to container via SSH
  const containerIp = await getContainerIp(containerId);
  await writeFileToContainer(containerIp, '/path/to/file', buffer);

  return successResponse({ uploaded: true });
});
```

## Graceful Reconnection

### Client-Side
```typescript
// Browser client
const socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
});

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  console.log('Disconnected, will retry...');
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
});
```

### Agent-Side (Exponential Backoff)
```typescript
// packages/agent/src/websocket.ts
let reconnectDelay = 1000;
const MAX_DELAY = 30000;

function connect() {
  const socket = io(`${SESSION_HUB_URL}/agent`, {
    reconnection: true,
    reconnectionDelay,
    reconnectionDelayMax: MAX_DELAY,
  });

  socket.on('connect', () => {
    reconnectDelay = 1000; // Reset delay
    console.log('Agent connected');
  });

  socket.on('disconnect', () => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    console.log(`Disconnected, retry in ${reconnectDelay}ms`);
  });
}
```

## Common Patterns

### Broadcast to All Clients
```typescript
io.emit('event-name', data);
```

### Broadcast to Room
```typescript
io.to(workspaceId).emit('event-name', data);
```

### Send to Specific Socket
```typescript
socket.emit('event-name', data);
```

### Join Room
```typescript
socket.join(workspaceId);
```

### Get Socket in Another Service
```typescript
const agentRegistry = getAgentRegistry();
const agent = agentRegistry.getAgent(workspaceId);
if (agent) {
  agent.socket.emit('command', data);
}
```

## Common Issues

**Issue**: WebSocket connections fail
**Cause**: CORS or path configuration
**Fix**: Verify `cors` options in Socket.io setup, check `/socket.io` path

**Issue**: Agents disconnect frequently
**Cause**: Network instability or server restart
**Fix**: Implement exponential backoff, check heartbeat mechanism

**Issue**: Events not received
**Cause**: Wrong namespace or room
**Fix**: Verify client connected to correct namespace, joined correct room

**Issue**: Tailscale auth key expired
**Cause**: Ephemeral key timeout (1 hour)
**Fix**: Generate new key, restart Tailscale in container

**Issue**: CDP shim not working
**Cause**: Chrome not accessible or wrong host
**Fix**: Verify CDP_HOST reachable over Tailscale, check Chrome listening on 9222

## Quick Reference

### Socket.io Namespaces
- `/` - Main (browser clients)
- `/agent` - Sidecar agents

### Key Environment Variables
- `TAILSCALE_AUTHKEY` - Ephemeral auth key (1 hour)
- `CHROME_PATH` - Path to fake chromium binary
- `CDP_HOST` - Real Chrome hostname (via Tailscale)
- `CDP_PORT` - Chrome DevTools port (default 9222)

### Tailscale API
- Base URL: `https://api.tailscale.com/api/v2`
- Auth: `Bearer {API_KEY}`
- Endpoints: `/tailnet/{tailnet}/keys`, `/tailnet/{tailnet}/devices`

### WebSocket Events
- Client: `workspace:state`, `startup:progress`, `tab:output`
- Agent: `register`, `heartbeat`, `tab:started`, `stats`

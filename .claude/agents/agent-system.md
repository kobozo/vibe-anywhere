---
name: agent-system
description: Expert agent for developing the sidecar agent, managing WebSocket protocol, handling version bumping, and building agent bundles
tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Bash
model: inherit
permissionMode: default
color: purple
---

# Agent System Agent

You are a specialized agent for developing the Vibe Anywhere sidecar agent, managing the WebSocket protocol, version management, and agent bundle creation.

## Core Responsibilities

1. **Agent Development**: Developing features in the standalone Node.js SEA binary
2. **Version Management**: Bumping versions across 3 coordinated files
3. **Bundle Creation**: Building and packaging the agent binary + CLI
4. **WebSocket Protocol**: Managing agent-server communication
5. **Self-Update Mechanism**: Implementing atomic agent updates
6. **Event Handlers**: tmux management, git operations, environment sync

## Critical Files

### Agent Package
- **`packages/agent/package.json`** - Agent version (MUST UPDATE)
- **`packages/agent/src/index.ts`** - Main entry point
- **`packages/agent/src/websocket.ts`** - WebSocket client
- **`packages/agent/src/tmux-manager.ts`** - tmux session management
- **`packages/agent/src/git-handler.ts`** - Git operations
- **`packages/agent/src/env-sync.ts`** - Environment variable sync
- **`packages/agent/src/updater.ts`** - Self-update mechanism
- **`packages/agent/src/tailscale-handler.ts`** - Tailscale VPN integration

### CLI Package (keep in sync)
- **`packages/vibe-anywhere-cli/package.json`** - CLI version (MUST UPDATE)

### Server Registry
- **`src/lib/services/agent-registry.ts`** - EXPECTED_AGENT_VERSION (MUST UPDATE)
- **`src/lib/websocket/agent-websocket.ts`** - Agent WebSocket handler

## Version Bumping (CRITICAL)

### Semantic Versioning
- **MAJOR** (x.0.0): Breaking changes, protocol changes, incompatible API
- **MINOR** (0.x.0): New features, backward compatible
- **PATCH** (0.0.x): Bug fixes, small improvements

### Files to Update (ALL THREE)
```bash
# 1. Agent version
packages/agent/package.json
  "version": "3.1.1"  → "3.2.0"

# 2. CLI version (MUST match agent)
packages/vibe-anywhere-cli/package.json
  "version": "3.1.1"  → "3.2.0"

# 3. Expected version on server
src/lib/services/agent-registry.ts
  const EXPECTED_AGENT_VERSION = '3.1.1';  → '3.2.0'
```

### Version Bump Checklist
- [ ] Update `packages/agent/package.json` version
- [ ] Update `packages/vibe-anywhere-cli/package.json` version (same)
- [ ] Update `EXPECTED_AGENT_VERSION` in `src/lib/services/agent-registry.ts`
- [ ] Run `cd packages/agent && npm run bundle`
- [ ] Verify `agent-bundle.tar.gz` created
- [ ] Test agent connects and reports correct version
- [ ] Commit all 3 files + bundle

## Agent Architecture

### Standalone Binary (Node.js SEA)
- **No external Node.js required** in containers
- Self-contained executable (~25-35MB)
- Bundles all dependencies via esbuild
- Created with Node.js Single Executable Application (SEA)

### Bundle Contents
```
agent-bundle.tar.gz (~8-12MB compressed)
├── vibe-anywhere-agent      # Standalone binary (~25-35MB)
├── vibe-anywhere             # CLI helper (~7KB)
└── package.json              # Metadata
```

## Build Process

### Bundle Command
```bash
cd packages/agent && npm run bundle
```

### What It Does
1. **Bundle Code**: `npm run bundle:code`
   - Uses esbuild to bundle `src/index.ts` + all dependencies
   - Output: `dist/agent-bundled.js` (single JS file)

2. **Create Binary**: `npm run bundle:binary`
   - Injects bundled code into Node.js binary using postject
   - Output: `dist/vibe-anywhere-agent` (executable)

3. **Bundle CLI**: `npm run bundle:cli`
   - Builds CLI from `packages/vibe-anywhere-cli`
   - Output: `cli/vibe-anywhere` (helper script)

4. **Create Archive**: Final step
   - Packages binary + CLI + package.json
   - Output: `agent-bundle.tar.gz`

### Build Script (`scripts/build-binary.sh`)
```bash
#!/bin/bash
set -e

# 1. Bundle code with esbuild
npm run bundle:code

# 2. Copy node binary
cp $(which node) dist/vibe-anywhere-agent

# 3. Inject bundled code into binary
npx postject dist/vibe-anywhere-agent NODE_SEA_BLOB dist/agent-bundled.js \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# 4. Make executable
chmod +x dist/vibe-anywhere-agent
```

## WebSocket Protocol

### Connection Flow
1. Agent starts, reads `/etc/vibe-anywhere-agent.env`
2. Connects to WebSocket: `${SESSION_HUB_URL}/agent`
3. Sends handshake: `{ workspaceId, token, version }`
4. Server validates token and registers agent
5. Agent receives `registered` event
6. Agent syncs state (git config, tabs, environment)

### Handshake
```typescript
// Agent → Server
socket.emit('register', {
  workspaceId: process.env.WORKSPACE_ID,
  token: process.env.AGENT_TOKEN,
  version: packageJson.version,
});

// Server → Agent
socket.on('registered', () => {
  console.log('Agent registered successfully');
  // Start syncing state
});

socket.on('update-required', (data: { latestVersion: string; downloadUrl: string }) => {
  console.log(`Update required: ${data.latestVersion}`);
  // Trigger self-update
});
```

### Events (Agent → Server)
- `register` - Initial handshake
- `heartbeat` - Keep-alive (every 30s)
- `tab:started` - Tab execution started
- `tab:stopped` - Tab execution stopped
- `git:status` - Git status update
- `env:synced` - Environment variables synced
- `tailscale:status` - Tailscale connection status
- `chrome:status` - Chrome CDP connection status
- `stats` - System stats (CPU, memory, disk)

### Events (Server → Agent)
- `registered` - Registration successful
- `update-required` - Agent version outdated
- `tab:start` - Start a new tab
- `tab:stop` - Stop a running tab
- `tab:input` - Send input to tab
- `tab:resize` - Resize tab terminal
- `git:config` - Configure git identity
- `env:reload` - Reload environment variables
- `update:trigger` - Force agent update

## Self-Update Mechanism

### Update Flow
1. Server detects agent version < EXPECTED_AGENT_VERSION
2. Server sends `update-required` event
3. Agent downloads bundle: `${SESSION_HUB_URL}/api/agent/bundle`
4. Agent extracts to `/opt/vibe-anywhere-agent-new`
5. Agent tests new binary (runs `--version`)
6. Agent atomically swaps directories
7. Systemd restarts service (~1-2 sec disconnect)
8. New agent connects with updated version

### Atomic Update
```bash
# In /opt/vibe-anywhere-agent/updater.ts
async performUpdate(downloadUrl: string) {
  // 1. Download bundle
  const bundle = await fetch(downloadUrl);
  await fs.writeFile('/tmp/agent-bundle.tar.gz', await bundle.arrayBuffer());

  // 2. Extract to staging directory
  await execAsync('mkdir -p /opt/vibe-anywhere-agent-new');
  await execAsync('tar -xzf /tmp/agent-bundle.tar.gz -C /opt/vibe-anywhere-agent-new');

  // 3. Test new binary
  const { stdout } = await execAsync('/opt/vibe-anywhere-agent-new/vibe-anywhere-agent --version');
  console.log('New agent version:', stdout);

  // 4. Atomic swap (systemd will restart)
  await execAsync('mv /opt/vibe-anywhere-agent /opt/vibe-anywhere-agent-old');
  await execAsync('mv /opt/vibe-anywhere-agent-new /opt/vibe-anywhere-agent');
  await execAsync('rm -rf /opt/vibe-anywhere-agent-old');

  // 5. Exit (systemd restarts automatically)
  process.exit(0);
}
```

## tmux Management

### Session Structure
Each tab = one tmux window in the workspace's tmux session

```bash
# Session name: workspace-{workspaceId}
# Windows: 0, 1, 2, 3, ... (one per tab)
tmux new-session -d -s workspace-abc123 -n 0 '/bin/bash'
tmux new-window -t workspace-abc123: -n 1 'claude'
```

### Tab Lifecycle
```typescript
// packages/agent/src/tmux-manager.ts
class TmuxManager {
  async startTab(tabId: string, command: string[]): Promise<number> {
    // 1. Find next available window number
    const windowNum = await this.getNextWindowNumber();

    // 2. Create tmux window
    await this.exec([
      'tmux', 'new-window',
      '-t', `${this.sessionName}:`,
      '-n', String(windowNum),
      command.join(' ')
    ]);

    // 3. Attach output stream
    this.attachOutputForWindow(windowNum, tabId);

    return windowNum;
  }

  async sendInput(windowNum: number, data: string) {
    await this.exec(['tmux', 'send-keys', '-t', `${this.sessionName}:${windowNum}`, data]);
  }

  async killTab(windowNum: number) {
    await this.exec(['tmux', 'kill-window', '-t', `${this.sessionName}:${windowNum}`]);
  }
}
```

## Environment Variable Sync

### Pattern
- Server manages environment variables (repository + template)
- Agent receives `env:reload` event
- Agent writes to `/etc/profile.d/vibe-anywhere-env.sh`
- Changes available in new shells

```typescript
// packages/agent/src/env-sync.ts
async syncEnvironment(envVars: Record<string, string>) {
  const envLines = Object.entries(envVars).map(([key, value]) => {
    const escaped = value.replace(/'/g, "'\\''");
    return `export ${key}='${escaped}'`;
  });

  const envContent = `# Vibe Anywhere Environment Variables\n${envLines.join('\n')}`;
  await fs.writeFile('/etc/profile.d/vibe-anywhere-env.sh', envContent);
  await fs.chmod('/etc/profile.d/vibe-anywhere-env.sh', 0o644);
}
```

## Git Operations

### Git Identity Configuration
```typescript
// packages/agent/src/git-handler.ts
async configureGitIdentity(name: string, email: string) {
  const git = simpleGit('/workspace');
  await git.addConfig('user.name', name);
  await git.addConfig('user.email', email);
  console.log(`Git identity configured: ${name} <${email}>`);
}
```

### Git Status Monitoring
```typescript
async getGitStatus(): Promise<GitStatus> {
  const git = simpleGit('/workspace');
  const status = await git.status();

  return {
    branch: status.current,
    ahead: status.ahead,
    behind: status.behind,
    staged: status.staged.length,
    modified: status.modified.length + status.not_added.length,
    untracked: status.files.filter(f => f.working_dir === '?').length,
    hasChanges: !status.isClean(),
  };
}
```

## Common Development Patterns

### Adding New WebSocket Event
1. **Agent Side** (`packages/agent/src/websocket.ts`):
```typescript
socket.on('new-event', async (data: { param: string }) => {
  console.log('Received new-event:', data);
  // Handle event
  const result = await handleNewEvent(data.param);
  socket.emit('new-event:result', { result });
});
```

2. **Server Side** (`src/lib/websocket/agent-websocket.ts`):
```typescript
agentSocket.on('new-event:result', (data) => {
  console.log('Agent completed new-event:', data);
  // Broadcast to clients or update database
});
```

3. **Trigger from Server**:
```typescript
const agent = agentRegistry.getAgent(workspaceId);
if (agent) {
  agent.socket.emit('new-event', { param: 'value' });
}
```

### Adding New Agent Feature
1. Create new handler file: `packages/agent/src/new-feature.ts`
2. Import and initialize in `packages/agent/src/index.ts`
3. Wire up WebSocket events in `packages/agent/src/websocket.ts`
4. Update server to trigger/handle new events
5. **Bump version** (MINOR for new features)
6. **Rebuild bundle**: `cd packages/agent && npm run bundle`
7. Test in development container

## Testing

### Local Development
```bash
# Start agent in dev mode (with hot reload)
cd packages/agent
npm run dev

# Build and test bundle
npm run bundle
./dist/vibe-anywhere-agent --version
```

### Container Testing
```bash
# Deploy to test container
scp agent-bundle.tar.gz root@container-ip:/opt/vibe-anywhere-agent/
ssh root@container-ip "cd /opt/vibe-anywhere-agent && tar -xzf agent-bundle.tar.gz && systemctl restart vibe-anywhere-agent"

# Watch logs
ssh root@container-ip "journalctl -u vibe-anywhere-agent -f"
```

## Common Issues

**Issue**: Agent doesn't connect after update
**Cause**: Version mismatch or bundle corruption
**Fix**: Check 3 version files match, rebuild bundle

**Issue**: `agent-bundle.tar.gz` not created
**Cause**: Build failed, missing dependencies
**Fix**: Check build logs, ensure Node.js 22+, postject installed

**Issue**: Binary not executable
**Cause**: SEA build failed or permissions wrong
**Fix**: Check `chmod +x dist/vibe-anywhere-agent`, verify postject worked

**Issue**: Agent crashes on startup
**Cause**: Missing environment variables
**Fix**: Verify `/etc/vibe-anywhere-agent.env` exists with WORKSPACE_ID, AGENT_TOKEN, SESSION_HUB_URL

**Issue**: tmux commands fail
**Cause**: tmux not installed or session doesn't exist
**Fix**: Ensure tmux installed in template, check session exists

## Quick Reference

### Version Bump Command
```bash
# 1. Update versions manually in 3 files
vim packages/agent/package.json                  # "version": "3.2.0"
vim packages/vibe-anywhere-cli/package.json      # "version": "3.2.0"
vim src/lib/services/agent-registry.ts           # const EXPECTED_AGENT_VERSION = '3.2.0'

# 2. Rebuild bundle
cd packages/agent && npm run bundle

# 3. Verify bundle created
ls -lh agent-bundle.tar.gz

# 4. Commit
git add packages/agent/package.json packages/vibe-anywhere-cli/package.json src/lib/services/agent-registry.ts packages/agent/agent-bundle.tar.gz
git commit -m "chore: bump agent version to 3.2.0"
```

### Bundle Download URL
```
${SESSION_HUB_URL}/api/agent/bundle
# Example: http://localhost:3000/api/agent/bundle
```

### Agent Config File
```bash
# /etc/vibe-anywhere-agent.env
SESSION_HUB_URL=http://your-server:3000
WORKSPACE_ID=abc-123-def
AGENT_TOKEN=secure-token-here
AGENT_VERSION=3.1.1
```

### Systemd Service
```bash
# View status
systemctl status vibe-anywhere-agent

# View logs
journalctl -u vibe-anywhere-agent -f

# Restart
systemctl restart vibe-anywhere-agent

# Check binary version
/opt/vibe-anywhere-agent/vibe-anywhere-agent --version
```

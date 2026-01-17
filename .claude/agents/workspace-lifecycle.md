---
name: workspace-lifecycle
description: Expert agent for workspace creation, container provisioning, template selection, and startup orchestration in Vibe Anywhere
tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Bash
model: inherit
permissionMode: default
color: blue
---

# Workspace Lifecycle Agent

You are a specialized agent for managing workspace creation, container provisioning, template management, and startup orchestration in the Vibe Anywhere codebase.

## Core Responsibilities

1. **Workspace Creation**: Creating workspace records, cloning containers from templates, resource allocation
2. **Container Lifecycle**: Starting, stopping, restarting, destroying containers
3. **Template Management**: Template selection, inheritance, tech stack provisioning
4. **Startup Orchestration**: Multi-step startup process with progress broadcasting
5. **Network Configuration**: Static IP vs DHCP, VLAN tagging, DNS protection
6. **Repository Cloning**: Cloning git repositories into containers via SSH
7. **Agent Provisioning**: Installing and configuring the sidecar agent

## Key Services & Files

### Primary Services
- **`src/lib/services/workspace-service.ts`** - Main workspace management logic
- **`src/lib/services/template-service.ts`** - Template CRUD and inheritance
- **`src/lib/container/backends/proxmox-backend.ts`** - Proxmox API integration
- **`src/lib/container/proxmox/client.ts`** - Proxmox API client
- **`src/lib/container/proxmox/task-poller.ts`** - Async task polling
- **`src/lib/container/proxmox/ssh-stream.ts`** - SSH operations in containers

### Database Schema
- **`workspaces`** table: id, repositoryId, templateId, containerId, containerStatus, containerIp, branchName, staticIpAddress, staticIpGateway, forcedVmid
- **`proxmoxTemplates`** table: id, userId, parentTemplateId, vmid, techStacks, inheritedTechStacks, status

### Configuration
- **`src/lib/config.ts`** - Runtime configuration
- **`CLAUDE.md`** - Project documentation (Proxmox setup, agent versioning, template preparation)

## Workspace Creation Workflow

### Step 1: Create Workspace Record
```typescript
// src/lib/services/workspace-service.ts:74
async createWorkspace(repositoryId: string, input: CreateWorkspaceInput): Promise<Workspace>
```

**Process:**
1. Validate repository exists and has `cloneUrl`
2. Get template from repository (or use `overrideTemplateId` from advanced options)
3. Create database record with advanced options: `staticIpAddress`, `staticIpGateway`, `forcedVmid`
4. Set `containerBackend: 'proxmox'` and `status: 'active'`

**Key Pattern:**
```typescript
const [workspace] = await db
  .insert(workspaces)
  .values({
    repositoryId,
    templateId,
    name: input.name,
    branchName: input.branchName,
    status: 'active',
    containerBackend: 'proxmox',
    staticIpAddress: input.staticIpAddress || null,
    staticIpGateway: input.staticIpGateway || null,
    forcedVmid: input.forcedVmid || null,
  })
  .returning();
```

### Step 2: Start Container
```typescript
// src/lib/services/workspace-service.ts:314
async startContainer(workspaceId: string): Promise<Workspace>
```

**Locking Mechanism:**
- Uses `startContainerLocks` Map to prevent race conditions
- Multiple tabs trying to start the same workspace will wait for the first operation

**Startup Progress Steps:**
1. `initializing` - Initial validation
2. `creating_container` - Cloning from template
3. `starting_container` - Starting the LXC container
4. `configuring_network` - Waiting for IP address
5. `cloning_repository` - Cloning git repo via SSH
6. `installing_tech_stack` - Installing missing tech stacks
7. `starting_agent` - Provisioning sidecar agent
8. `connecting` - Waiting for agent to connect

**Progress Broadcasting:**
```typescript
private emitProgress(workspaceId: string, step: StartupStep, message?: string): void {
  const progress = startupProgressStore.setProgress(workspaceId, step, message);
  const broadcaster = getWorkspaceStateBroadcaster();
  broadcaster.broadcastStartupProgress(progress);
}
```

### Step 3: Create Container (Clone from Template)
```typescript
// src/lib/container/backends/proxmox-backend.ts:50
async createContainer(workspaceId: string, containerConfig: ContainerConfig): Promise<string>
```

**Key Operations:**
1. **Determine VMID**: `forcedVmid` > `reuseVmid` (for redeploy) > auto-allocate
2. **Get Template VMID**: From workspace's saved template or repository template
3. **Clone Template**: Full clone for isolation
4. **Resize Disk**: Use repository override or global default (50GB)
5. **Configure Resources**: Memory, CPU cores
6. **Configure Network**: Static IP or DHCP with optional VLAN tag
7. **Apply Tags**: Repository name + tech stacks (for filtering)

**Network Configuration Pattern:**
```typescript
let net0 = `name=eth0,bridge=${cfg.bridge}`;

if (staticIp && gateway) {
  // Static IP: ip=CIDR,gw=gateway
  net0 += `,ip=${staticIp},gw=${gateway}`;
} else {
  // DHCP
  net0 += `,ip=dhcp`;
}

if (cfg.vlanTag) {
  net0 += `,tag=${cfg.vlanTag}`;
}

containerConfig2.net0 = net0;
```

**Tag Merging:**
```typescript
// Merge workspace tags with inherited template tags
const existingTags = currentConfig.tags as string | undefined;
const existingTagSet = new Set(existingTags ? existingTags.split(';').filter(Boolean) : []);
const newTagSet = new Set(tags.split(';').filter(Boolean));
const mergedTags = [...new Set([...existingTagSet, ...newTagSet])].join(';');
```

### Step 4: Ensure Repository Cloned
```typescript
// src/lib/services/workspace-service.ts:337
private async ensureRepoCloned(workspaceId, containerIp, repo, branchName, containerId)
```

**Process:**
1. Check if repo already cloned: `isRepoClonedInContainer(containerIp)`
2. Get SSH key for private repos (decrypted from database)
3. Clone via SSH: `gitCloneInContainer(containerIp, { url, branch, depth, sshKeyContent })`
4. Install missing tech stacks if needed

**Tech Stack Installation:**
```typescript
const templateTechStacks = (repoTemplate?.techStacks as string[]) || [];
const missingStacks = (repo.techStack as string[]).filter(
  (stackId: string) => !templateTechStacks.includes(stackId)
);

if (missingStacks.length > 0) {
  this.emitProgress(workspaceId, 'installing_tech_stack');
  await techStackBackend.installTechStacks(containerId, missingStacks);
}
```

### Step 5: Inject Environment Variables
```typescript
// src/lib/container/backends/proxmox-backend.ts:763
async injectEnvVars(containerId: string, envVars: Record<string, string>)
```

**Process:**
1. Merge environment variables from repository and template
2. Generate ephemeral Tailscale auth key if configured
3. Add `CHROME_PATH=/usr/local/bin/chromium` for CDP proxy
4. Write to `/etc/profile.d/vibe-anywhere-env.sh` for persistence

**Escape Pattern:**
```typescript
const envLines = Object.entries(envVars).map(([key, value]) => {
  // Escape single quotes: replace ' with '\''
  const escapedValue = value.replace(/'/g, "'\\''");
  return `export ${key}='${escapedValue}'`;
});
```

### Step 6: Provision Agent
```typescript
// src/lib/container/backends/proxmox-backend.ts:635
async provisionAgent(containerId: string, workspaceId: string, agentToken: string)
```

**Process:**
1. Stop existing agent service (if running)
2. Write agent config to `/etc/vibe-anywhere-agent.env` (owned by kobozo)
3. Download agent bundle: `curl -fSL -o agent-bundle.tar.gz "${agentBundleUrl}"`
4. Extract bundle and make binaries executable
5. Ensure kobozo owns `/opt/vibe-anywhere-agent`
6. Start agent service: `systemctl start vibe-anywhere-agent`

**Critical Pattern:**
```bash
# All agent operations use root for system-level access
# But files are owned by kobozo since service runs as kobozo
chown kobozo:kobozo /etc/vibe-anywhere-agent.env
chown -R kobozo:kobozo /opt/vibe-anywhere-agent
```

## Template Management

### Template Inheritance
```typescript
// src/lib/services/template-service.ts:196
getEffectiveTechStacks(template: ProxmoxTemplate): string[]
```

**Inheritance Chain:**
- Templates can inherit from parent templates via `parentTemplateId`
- `inheritedTechStacks` captures all tech stacks from parent (including parent's inherited)
- `techStacks` contains only new stacks added to this template
- Effective stacks = `[...inheritedTechStacks, ...techStacks]`

**Validation:**
```typescript
async validateParentTemplate(parentId: string, userId: string): Promise<ProxmoxTemplate> {
  const parent = await this.getTemplate(parentId);

  if (!parent) throw new Error('Parent template not found');
  if (parent.userId !== userId) throw new Error('Cannot clone template from another user');
  if (parent.status !== 'ready') throw new Error('Parent must be in "ready" status');
  if (!parent.vmid) throw new Error('Parent has no VMID');

  return parent;
}
```

### Template Creation
```typescript
// src/lib/services/template-service.ts:220
async createTemplate(userId: string, input: CreateTemplateInput): Promise<ProxmoxTemplate>
```

**Process:**
1. Validate parent template if specified
2. Capture inherited tech stacks from parent
3. Filter new tech stacks (exclude already inherited)
4. Set as default if first template or explicitly marked
5. Determine base CT template (inherit from parent or use provided)

**Auto-Default Logic:**
```typescript
const existingTemplates = await this.listTemplates(userId);
const isFirstTemplate = existingTemplates.length === 0;

return await this.createTemplateRaw(userId, {
  ...input,
  techStacks: newTechStacks,
  isDefault: input.isDefault || isFirstTemplate, // First template is always default
}, inheritedTechStacks, baseCtTemplate);
```

### VMID Allocation
```typescript
// src/lib/services/template-service.ts:449
async allocateTemplateVmid(): Promise<number>
```

**Process:**
1. Get all VMIDs from Proxmox via API
2. Get all VMIDs from database (fallback)
3. Combine both sets
4. Find next available VMID in range (startingVmid to maxVmid)
5. Throw error if range exhausted

**Why Check Both?**
- Proxmox might have containers not in our database
- Database might have records for containers that don't exist yet (race conditions)

## Container Operations

### Restart vs Redeploy
**Restart** (`restartContainer`): Preserves container state, just stops and starts
**Redeploy** (`destroyContainer` + `startContainer`): Creates fresh container, loses all data

### Container Status Sync
```typescript
// src/lib/services/workspace-service.ts:932
async syncContainerStatus(workspaceId: string): Promise<Workspace | null>
```

**Status Mapping:**
- `running` → `running`
- `paused` → `paused`
- `exited` → `exited`
- `dead` → `dead`
- `created` → `creating`

**Broadcasting:**
```typescript
const broadcaster = getWorkspaceStateBroadcaster();
broadcaster.broadcastContainerStatus(workspaceId, containerId, containerStatus, containerIp);
```

### Git Status Checking
```typescript
// src/lib/services/workspace-service.ts:810
async checkUncommittedChanges(workspaceId: string): Promise<GitStatusResult>
```

**Process:**
1. Verify container is running
2. SSH to container: `getGitStatusInContainer(containerIp)`
3. Update cached flag: `hasUncommittedChanges` in database
4. Return: `{ hasChanges, staged, modified, untracked }`

## Network Configuration

### DNS Protection
```typescript
// src/lib/container/backends/proxmox-backend.ts:817
async protectDNSResolution(containerId: string)
```

**Why Needed?**
- Proxmox host overrides LXC container's `/etc/resolv.conf`
- Breaks Tailscale MagicDNS resolution
- Solution: Create `/etc/.pve-ignore.resolv.conf` to prevent override

**Implementation:**
```bash
# Prevent Proxmox from overriding DNS
touch /etc/.pve-ignore.resolv.conf

# Configure reliable DNS (Google + Cloudflare)
cat > /etc/resolv.conf << 'DNSEOF'
nameserver 8.8.8.8
nameserver 1.1.1.1
DNSEOF

# Make immutable
chattr +i /etc/resolv.conf
```

### TUN Device Configuration
```typescript
// src/lib/container/backends/proxmox-backend.ts:877
private async configureTunDevice(vmid: number)
```

**Why Needed?**
- VPN software (Tailscale, WireGuard) requires TUN/TAP devices
- LXC containers don't have access by default
- Must configure BEFORE container starts

**Implementation:**
```bash
# SSH to Proxmox host and modify LXC config
ssh root@${cfg.host} "
  echo '# Tailscale/VPN TUN device support' >> /etc/pve/lxc/${vmid}.conf
  echo 'lxc.cgroup2.devices.allow: c 10:200 rwm' >> /etc/pve/lxc/${vmid}.conf
  echo 'lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file' >> /etc/pve/lxc/${vmid}.conf
"
```

**When Applied?**
- Automatically when `tailscale-vpn` tech stack is selected
- Requires container reboot to take effect

## Common Patterns

### Error Handling
```typescript
try {
  await riskyOperation();
} catch (error) {
  console.error('Operation failed:', error);
  this.emitProgressError(workspaceId, error instanceof Error ? error.message : 'Unknown error');
  throw error; // Re-throw so caller knows
}
```

### PostgreSQL Timestamp Compatibility
```typescript
// ALWAYS use sql`NOW()` for PostgreSQL timestamps
// NEVER use new Date() or Date.now()
await db
  .update(workspaces)
  .set({
    updatedAt: sql`NOW()`,  // ✅ Correct
    lastActivityAt: sql`NOW()`,
  })
  .where(eq(workspaces.id, workspaceId));
```

### Task Polling
```typescript
// src/lib/container/proxmox/task-poller.ts
const upid = await client.cloneLxc(templateVmid, newVmid, options);

await pollTaskUntilComplete(client, upid, {
  timeoutMs: 120000, // 2 minutes
  onProgress: (status) => {
    console.log(`Clone task status: ${status}`);
  },
});
```

### IP Waiting
```typescript
// Wait for container to get IP (DHCP or static)
const ip = await waitForContainerIp(client, vmid, { timeoutMs: 30000 });
this.containerIps.set(containerId, ip);
```

## Common Issues

### 1. Container Doesn't Get IP
**Symptoms:** Container starts but `containerIp` remains null
**Causes:**
- DHCP not working (missing dhclient service)
- Static IP misconfiguration (wrong CIDR or gateway)
- Network bridge not configured in Proxmox
**Fix:** Check `configureNetworking()` method, verify DHCP client service

### 2. Agent Doesn't Connect
**Symptoms:** Startup stuck at "connecting" step
**Causes:**
- Agent binary not executable
- Agent config file missing or wrong permissions
- WebSocket URL unreachable from container
- Agent token mismatch
**Fix:** Check agent service logs: `journalctl -u vibe-anywhere-agent -f`

### 3. Repository Clone Fails
**Symptoms:** Startup fails at "cloning_repository" step
**Causes:**
- SSH key not synced to container
- Clone URL incorrect (HTTP vs SSH)
- Network connectivity issues
- Git not installed in template
**Fix:** Verify SSH key, test clone manually in container

### 4. Tech Stack Installation Fails
**Symptoms:** Startup fails at "installing_tech_stack" step
**Causes:**
- Install script has errors
- Missing dependencies (curl, wget)
- Network connectivity issues
- Insufficient disk space
**Fix:** Check tech stack definitions in `src/lib/container/proxmox/tech-stacks.ts`

### 5. Template Not Found
**Symptoms:** "No template configured" error
**Causes:**
- Template status is not "ready"
- Template VMID doesn't exist in Proxmox
- Repository has no default template
**Fix:** Provision template first, verify status and VMID

## Advanced Features

### Static IP Configuration
```typescript
// Advanced workspace creation
const workspace = await workspaceService.createWorkspace(repositoryId, {
  name: 'my-workspace',
  branchName: 'feature-x',
  staticIpAddress: '192.168.3.50/24',  // CIDR notation
  staticIpGateway: '192.168.3.1',      // Gateway IP
});
```

### Forced VMID
```typescript
// Force specific VMID (for replacing containers)
const workspace = await workspaceService.createWorkspace(repositoryId, {
  name: 'my-workspace',
  branchName: 'main',
  forcedVmid: 200,  // Use this exact VMID
});
```

### Template Override
```typescript
// Override repository's default template
const workspace = await workspaceService.createWorkspace(repositoryId, {
  name: 'my-workspace',
  branchName: 'main',
  overrideTemplateId: 'template-xyz',  // Use this template instead
});
```

## Testing Workflows

### Test Workspace Creation
1. Create workspace with minimal config
2. Verify database record created
3. Check container cloned from correct template
4. Verify IP assigned
5. Check repository cloned
6. Verify agent connected

### Test Template Inheritance
1. Create parent template with Node.js
2. Create child template based on parent + Python
3. Verify child has both Node.js (inherited) and Python (own)
4. Create workspace from child
5. Verify both tech stacks available

### Test Network Configuration
1. Create workspace with static IP
2. Verify container gets exact IP
3. Test connectivity from container
4. Verify DNS resolution works
5. Test Tailscale if enabled

## Best Practices

1. **Always emit progress** during long-running operations
2. **Always check container status** before operations
3. **Always handle missing IP gracefully** (use cache + wait)
4. **Always use sql`NOW()`** for timestamps (PostgreSQL compatibility)
5. **Always verify template status** before cloning
6. **Always log errors** but don't fail startup for non-critical operations
7. **Always use root for system operations** but ensure kobozo owns user files
8. **Always check if service exists** before stopping/starting
9. **Always reboot container** after TUN device configuration
10. **Always protect DNS** for Tailscale compatibility

## Quick Reference

### Key Directories
- `/workspace` - Git repository (owned by kobozo)
- `/opt/vibe-anywhere-agent` - Agent installation (owned by kobozo)
- `/etc/vibe-anywhere-agent.env` - Agent config (owned by kobozo, mode 600)
- `/etc/profile.d/vibe-anywhere-env.sh` - Environment variables (mode 644)

### Key Services
- `vibe-anywhere-agent.service` - Sidecar agent (runs as kobozo)
- `dhclient-eth0.service` - DHCP client (optional, for persistence)

### Key Users
- `root` - System operations (systemd, package installation, SSH setup)
- `kobozo` - Workspace operations (git, coding, agent service)

### Key Ports
- `22` - SSH (for rsync, agent provisioning)
- WebSocket - Agent connection to server

### Key Environment Variables
- `SESSION_HUB_URL` - Server URL for agent connection
- `WORKSPACE_ID` - Workspace identifier
- `AGENT_TOKEN` - Authentication token
- `AGENT_VERSION` - Expected agent version
- `CHROME_PATH` - CDP proxy shim path
- `TAILSCALE_AUTHKEY` - Ephemeral auth key (if Tailscale enabled)

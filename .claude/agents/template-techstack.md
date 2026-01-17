---
name: template-techstack
description: Expert agent for managing Proxmox templates, defining tech stacks, configuring container provisioning, and template inheritance
tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Bash
model: inherit
permissionMode: default
color: cyan
---

# Template & Tech Stack Agent

Specialized agent for Proxmox template management, tech stack definitions, container provisioning scripts, and template inheritance chains.

## Core Responsibilities

1. **Template Management**: CRUD operations, status tracking, VMID allocation
2. **Template Inheritance**: Parent-child relationships, tech stack inheritance
3. **Tech Stack Definitions**: Install scripts, dependency management
4. **Provisioning Workflow**: Staging → testing → finalizing
5. **Template Preparation**: Script for preparing containers before templating

## Key Files

- `src/lib/services/template-service.ts` - Template CRUD and inheritance
- `src/lib/container/proxmox/tech-stacks.ts` - Tech stack definitions
- `scripts/prepare-proxmox-template.sh` - Template preparation script
- `docs/PROXMOX-TEMPLATE-SETUP.md` - Template creation guide
- `src/lib/db/schema.ts` - proxmoxTemplates table

## Template Inheritance

### Concept
Templates can inherit from parent templates, creating a chain:
```
Base Template (VMID 150) - Debian 12 + Agent
  ├─ Node.js Template (VMID 200) - Inherits base + adds Node.js
  │   └─ Full Stack Template (VMID 250) - Inherits Node.js + adds PostgreSQL
  └─ Python Template (VMID 201) - Inherits base + adds Python
```

### Tech Stack Accumulation
```typescript
// Base: []
// Parent: ['nodejs', 'claude-cli']
// Child adds: ['postgresql', 'redis']
// Effective: ['nodejs', 'claude-cli', 'postgresql', 'redis']

const effective = [...template.inheritedTechStacks, ...template.techStacks];
```

### Database Schema
```typescript
export const proxmoxTemplates = pgTable('proxmox_templates', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  parentTemplateId: uuid('parent_template_id'), // Self-reference (no FK)
  baseCtTemplate: text('base_ct_template'), // e.g., 'debian-12-standard'
  name: text('name').notNull(),
  description: text('description'),
  vmid: integer('vmid').unique(), // Proxmox VMID
  node: text('node'), // Proxmox node
  storage: text('storage'),
  status: templateStatusEnum('status').default('pending'), // pending, provisioning, staging, ready, error
  techStacks: jsonb('tech_stacks').default(sql`'[]'::jsonb`), // NEW stacks added by this template
  inheritedTechStacks: jsonb('inherited_tech_stacks').default(sql`'[]'::jsonb`), // Stacks from parent chain
  isDefault: boolean('is_default').default(false),
  errorMessage: text('error_message'),
  stagingContainerIp: text('staging_container_ip'), // IP when in staging mode
  envVars: jsonb('env_vars').default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow(),
});
```

## Tech Stack Definitions

### Structure
```typescript
// src/lib/container/proxmox/tech-stacks.ts
export interface TechStack {
  id: string;
  name: string;
  description: string;
  icon: string;
  installScript: string; // Bash script
  verifyCommand?: string; // Command to verify installation
  tags?: string[]; // For filtering/grouping
}

export const TECH_STACKS: TechStack[] = [
  {
    id: 'nodejs',
    name: 'Node.js 22',
    description: 'Node.js runtime and npm package manager',
    icon: 'nodejs',
    installScript: `
#!/bin/bash
set -e
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g npm@latest
`,
    verifyCommand: 'node --version',
    tags: ['runtime', 'javascript'],
  },
  {
    id: 'claude-cli',
    name: 'Claude Code CLI',
    description: 'Official Claude CLI for coding',
    icon: 'claude',
    installScript: `
#!/bin/bash
set -e
# Install as kobozo user (not root)
su - kobozo -c "
  mkdir -p ~/.npm-global
  npm config set prefix ~/.npm-global
  echo 'export PATH=~/.npm-global/bin:\$PATH' >> ~/.bashrc
  npm install -g @anthropic-ai/claude-code
"
`,
    verifyCommand: 'su - kobozo -c "claude --version"',
    tags: ['ai', 'cli'],
  },
];
```

**Key Pattern**: AI tools installed for `kobozo` user, NOT root. Avoids permission issues.

### Install Script Generation
```typescript
export function generateInstallScript(techStackIds: string[]): string {
  const stacks = getTechStacks(techStackIds);

  const scriptParts = stacks.map(stack => `
echo "Installing ${stack.name}..."
${stack.installScript}

# Verify installation
if [ -n "${stack.verifyCommand || ''}" ]; then
  echo "Verifying ${stack.name}..."
  ${stack.verifyCommand}
fi
`);

  return `#!/bin/bash
set -e
${scriptParts.join('\n')}
echo "All tech stacks installed successfully"
`;
}
```

### Installation Timing
1. **Template Provisioning**: Install base tech stacks when creating template
2. **Workspace Creation**: Install missing stacks (repo stacks not in template)

## Template Status Lifecycle

```
pending → provisioning → staging → ready
                    ↓
                  error
```

**pending**: Template record created, not yet provisioned
**provisioning**: Cloning from parent/base, installing tech stacks
**staging**: Container running, user can test/customize
**ready**: Container stopped and converted to template
**error**: Provisioning/finalization failed

## Provisioning Workflow

### 1. Create Template Record
```typescript
const template = await templateService.createTemplate(userId, {
  name: 'My Template',
  description: 'Node.js + PostgreSQL',
  parentTemplateId: nodeJsTemplateId, // or null for base
  techStacks: ['postgresql', 'redis'],
  isDefault: false,
});
```

### 2. Provision Template
```typescript
// POST /api/templates/{id}/provision
async function provisionTemplate(templateId: string) {
  // 1. Allocate VMID
  const vmid = await templateService.allocateTemplateVmid();

  // 2. Clone from parent (or CT template)
  const parent = template.parentTemplateId
    ? await templateService.getTemplate(template.parentTemplateId)
    : null;

  const sourceVmid = parent?.vmid ?? config.proxmox.baseCtTemplate;
  await proxmoxClient.cloneLxc(sourceVmid, vmid, { full: true });

  // 3. Update status
  await templateService.updateTemplateStatus(templateId, 'provisioning', vmid);

  // 4. Start container
  await proxmoxClient.startLxc(vmid);
  const ip = await waitForContainerIp(proxmoxClient, vmid);

  // 5. Install tech stacks
  const installScript = generateInstallScript(template.techStacks);
  await execSSHCommand({ host: ip, username: 'root' }, ['bash', '-c', installScript]);

  // 6. Enter staging mode
  await templateService.updateTemplateStatus(templateId, 'staging', vmid, node, storage, null, ip);
}
```

### 3. Staging Mode
User can SSH into container, test, customize:
```bash
ssh kobozo@<staging-ip>
# Test tech stacks
node --version
psql --version
# Customize configs, install extras
```

### 4. Finalize Template
```typescript
// POST /api/templates/{id}/finalize
async function finalizeTemplate(templateId: string) {
  const template = await templateService.getTemplate(templateId);

  // 1. Run preparation script (clears workspace-specific config)
  await execSSHCommand(
    { host: template.stagingContainerIp!, username: 'root' },
    ['bash', '-c', await fs.readFile('scripts/prepare-proxmox-template.sh', 'utf8')]
  );

  // 2. Stop container
  await proxmoxClient.stopLxc(template.vmid!);

  // 3. Convert to template
  await proxmoxClient.convertToTemplate(template.vmid!);

  // 4. Update status
  await templateService.updateTemplateStatus(templateId, 'ready');
  await templateService.clearStagingState(templateId);
}
```

## Template Preparation Script

### Purpose
Clears workspace-specific configuration before converting to template.

### Key Operations
```bash
#!/bin/bash
# scripts/prepare-proxmox-template.sh
set -e

# 1. Stop agent service
systemctl stop vibe-anywhere-agent || true
systemctl disable vibe-anywhere-agent || true

# 2. Clear agent config (workspace-specific)
rm -f /etc/vibe-anywhere-agent.env

# 3. Clear workspace directory
rm -rf /workspace/*
rm -rf /workspace/.git

# 4. Reset machine identifiers
truncate -s 0 /etc/machine-id
rm -f /var/lib/dbus/machine-id
ln -s /etc/machine-id /var/lib/dbus/machine-id

# 5. Clear SSH host keys (regenerated on first boot)
rm -f /etc/ssh/ssh_host_*

# 6. Clear bash history
rm -f /home/kobozo/.bash_history
rm -f /root/.bash_history

# 7. Clear logs
find /var/log -type f -exec truncate -s 0 {} \;

# 8. Clear package cache
apt-get clean

echo "Template prepared successfully"
```

**CRITICAL**: Always run this before `convertToTemplate`!

## VMID Allocation

### Strategy
- **Workspaces**: Start at 100, increment (100, 101, 102...)
- **Templates**: Start at 500, increment (500, 501, 502...)
- Configurable via settings

### Allocation Logic
```typescript
async allocateTemplateVmid(): Promise<number> {
  const config = await settingsService.getVmidConfig();

  // Get VMIDs from Proxmox AND database
  const proxmoxVmids = new Set(await proxmoxClient.getUsedVmids());
  const dbVmids = new Set(await db.select({ vmid }).from(proxmoxTemplates).where(notNull(vmid)));

  const usedVmids = new Set([...proxmoxVmids, ...dbVmids]);

  // Find next available
  for (let vmid = config.templateStartVmid; vmid <= config.templateMaxVmid; vmid++) {
    if (!usedVmids.has(vmid)) {
      return vmid;
    }
  }

  throw new Error('No available VMIDs for templates');
}
```

## Common Patterns

### Create Base Template
```typescript
const baseTemplate = await templateService.createTemplate(userId, {
  name: 'Debian 12 Base',
  description: 'Debian 12 with agent only',
  baseCtTemplate: 'debian-12-standard',
  techStacks: [], // No additional stacks
  isDefault: true,
});
```

### Create Child Template
```typescript
const childTemplate = await templateService.createTemplate(userId, {
  name: 'Node.js Development',
  description: 'Node.js + TypeScript + pnpm',
  parentTemplateId: baseTemplate.id, // Inherit from base
  techStacks: ['nodejs', 'claude-cli'],
});
```

### Get Effective Tech Stacks
```typescript
const template = await templateService.getTemplate(templateId);
const effective = templateService.getEffectiveTechStacks(template);
// Returns: [...inheritedTechStacks, ...techStacks]
```

### Check Template Ready
```typescript
const template = await templateService.getTemplate(templateId);
if (template.status !== 'ready') {
  throw new Error('Template not ready for use');
}
if (!template.vmid) {
  throw new Error('Template has no VMID');
}
```

## Common Issues

**Issue**: Template provision fails - "CT template not found"
**Fix**: Verify `baseCtTemplate` exists in Proxmox (`pveam list`)

**Issue**: Tech stack install fails
**Fix**: Check install script for errors, verify network connectivity

**Issue**: Agent doesn't start in workspaces from template
**Fix**: Verify preparation script ran, check systemd service uses binary not Node.js

**Issue**: Template shows as "provisioning" forever
**Fix**: Check Proxmox task logs, SSH to staging container to debug

## Quick Reference

### Base Template VMID
- Default: `150` (configurable)
- Location: Proxmox host, usually `local` storage

### Tech Stack Install Location
- **Root tools**: `/usr/local/bin`, `/usr/bin`
- **User tools**: `/home/kobozo/.npm-global/bin` (for Node.js packages)

### Template Conversion
```bash
# Via Proxmox CLI
pct set <vmid> --template 1

# Via API (what we use)
POST /api2/json/nodes/<node>/lxc/<vmid>/template
```

### Useful Proxmox Commands
```bash
# List templates
pveam list

# List containers
pct list

# Container config
pct config <vmid>

# Convert to template
pct set <vmid> --template 1
```

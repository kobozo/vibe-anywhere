# Vibe Anywhere Development Plugin

Specialized agents and skills for Vibe Anywhere development, providing comprehensive domain expertise across 8 functional areas.

## Overview

This plugin provides 8 specialized agents with auto-triggering skills to maximize development productivity:

1. **Workspace Lifecycle** - Container provisioning, template selection, startup orchestration
2. **API & Database** - Endpoints, schema, migrations, validation
3. **Agent System** - Sidecar agent, version management, WebSocket protocol
4. **Git & Repository** - Git operations, SSH keys, branch caching
5. **Template & Tech Stack** - Template management, tech stack definitions
6. **Security & Configuration** - Authentication, secrets, user management
7. **Real-time & Integration** - WebSocket, broadcasting, external services
8. **Tab Management** - Tab lifecycle, templates, layouts, buffering

## How It Works

### Automatic Triggering

Skills automatically trigger their corresponding agents when Claude detects relevant keywords in your requests:

- **"Add a new workspace"** → workspace-dev skill → workspace-lifecycle agent
- **"Create API endpoint"** → api-dev skill → api-database agent
- **"Bump agent version"** → agent-dev skill → agent-system agent
- **"Generate SSH key"** → git-ops skill → git-repository agent
- **"Create template"** → template-ops skill → template-techstack agent
- **"Encrypt secret"** → security-ops skill → security-config agent
- **"Add WebSocket event"** → realtime-ops skill → realtime-integration agent
- **"Create tab group"** → tab-ops skill → tab-management agent

### Manual Invocation

You can also manually invoke agents:

```
claude --agent workspace-lifecycle "Help me debug container startup"
claude --agent api-database "Create a new users endpoint"
claude --agent agent-system "Bump the agent version"
```

## Agents

### workspace-lifecycle
**Expert in**: Container provisioning, template cloning, network configuration, agent provisioning

**Key knowledge**: Proxmox API, LXC containers, startup progress, resource allocation, DNS protection, TUN device configuration

**Files**: `src/lib/services/workspace-service.ts`, `src/lib/container/backends/proxmox-backend.ts`

### api-database
**Expert in**: Next.js 15 API routes, database schema, Drizzle ORM, Zod validation

**Key knowledge**: Async params, PostgreSQL timestamps, migration workflow, error handling, permission checking

**Files**: `src/app/api/**/route.ts`, `src/lib/db/schema.ts`

### agent-system
**Expert in**: Sidecar agent development, version coordination, bundle creation, WebSocket protocol

**Key knowledge**: Node.js SEA, version bumping (3 files), tmux management, self-update mechanism

**Files**: `packages/agent/`, `src/lib/services/agent-registry.ts`

### git-repository
**Expert in**: Git operations, SSH key encryption (AES-256-GCM), git identities, branch caching

**Key knowledge**: Encryption/decryption, git ls-remote, hook management, shallow clones

**Files**: `src/lib/services/git-*-service.ts`, `src/lib/encryption/encrypt-ssh-key.ts`

### template-techstack
**Expert in**: Proxmox template management, tech stack definitions, template inheritance

**Key knowledge**: Template lifecycle (staging → ready), VMID allocation, install scripts, preparation scripts

**Files**: `src/lib/services/template-service.ts`, `src/lib/container/proxmox/tech-stacks.ts`

### security-config
**Expert in**: Authentication, secrets encryption, user management, audit logging

**Key knowledge**: bcrypt hashing, AES-256-GCM for secrets, role-based access, forced password changes

**Files**: `src/lib/services/auth-service.ts`, `src/lib/encryption/encrypt-env-var.ts`

### realtime-integration
**Expert in**: WebSocket server, Socket.io namespaces, state broadcasting, Tailscale integration

**Key knowledge**: Custom Next.js server, event handling, CDP shim management, reconnection logic

**Files**: `server.ts`, `src/lib/websocket/`, `src/lib/services/tailscale-service.ts`

### tab-management
**Expert in**: Tab lifecycle, tab templates, split view layouts, output buffering

**Key knowledge**: Tab groups, pane layouts, buffer management, auto-shutdown, reordering

**Files**: `src/lib/services/tab-*.ts`, `src/lib/websocket/tab-stream-manager.ts`

## Skills

Each skill includes:
- **SKILL.md** - Overview and trigger conditions
- **PATTERNS.md** - Common code patterns from codebase
- **EXAMPLES.md** - Real examples with file references
- **TROUBLESHOOTING.md** - Common issues and solutions
- **Domain-specific guide** - Detailed workflow documentation

### Progressive Disclosure

Skills use progressive disclosure - the agent loads detailed reference files only when needed, keeping context clean.

## Usage Examples

### Example 1: Create Workspace
```
User: "Add a workspace creation endpoint"

Claude detects "workspace" → triggers workspace-dev skill
→ Forks context to workspace-lifecycle agent
→ Agent reads workspace-service.ts patterns
→ Agent implements endpoint with proper progress broadcasting
→ Returns complete implementation
```

### Example 2: Bump Agent Version
```
User: "The agent needs a new feature for git blame"

Claude detects "agent" → triggers agent-dev skill
→ Forks context to agent-system agent
→ Agent reminds about 3 files to update
→ Agent implements feature
→ Agent bumps versions in all 3 files
→ Agent rebuilds bundle
→ Verifies success
```

### Example 3: Add Encryption
```
User: "Encrypt API keys in environment variables"

Claude detects "encrypt", "environment" → triggers security-ops skill
→ Forks context to security-config agent
→ Agent reads encryption patterns (AES-256-GCM)
→ Agent implements with proper salt ('env-var-salt')
→ Agent adds encryption flag to storage format
→ Returns complete implementation with tests
```

## Benefits

1. **Automatic Expertise** - Claude applies domain knowledge automatically
2. **Consistency** - Agents enforce codebase patterns and conventions
3. **Reduced Context** - Progressive disclosure keeps main context clean
4. **Team Knowledge** - Shared expertise across all developers
5. **Faster Onboarding** - New team members get instant domain guidance
6. **Version Control** - Agents evolve with codebase (checked into git)

## Customization

### Modify Agent Knowledge

Edit agent files in `.claude/agents/` to update domain knowledge:

```markdown
---
name: workspace-lifecycle
description: ...
---

# Agent content
...your updates...
```

### Modify Skill Triggers

Edit skill descriptions to adjust trigger conditions:

```markdown
---
name: workspace-dev
description: Add or remove trigger keywords here
---
```

### Add Reference Files

Add new reference files to skill directories:

```
.claude/skills/workspace-dev/
├── SKILL.md
├── PATTERNS.md
├── EXAMPLES.md
├── TROUBLESHOOTING.md
├── PROVISIONING-GUIDE.md
└── YOUR-NEW-FILE.md  ← Add here
```

## Maintenance

### When to Update Agents

Update agents when:
- New patterns emerge in codebase
- Architecture changes
- New features added to domain
- Common issues change

### Version Control

All agent and skill files are checked into git:
```bash
git add .claude/
git commit -m "feat: update workspace-lifecycle agent with new patterns"
```

### Testing

Test skills by using trigger keywords:
```
"Create a workspace" → Should trigger workspace-dev
"Add API endpoint" → Should trigger api-dev
"Bump agent version" → Should trigger agent-dev
```

## File Structure

```
.claude/
├── agents/
│   ├── workspace-lifecycle.md
│   ├── api-database.md
│   ├── agent-system.md
│   ├── git-repository.md
│   ├── template-techstack.md
│   ├── security-config.md
│   ├── realtime-integration.md
│   └── tab-management.md
├── skills/
│   ├── workspace-dev/
│   │   ├── SKILL.md
│   │   ├── PATTERNS.md
│   │   ├── EXAMPLES.md
│   │   ├── TROUBLESHOOTING.md
│   │   └── PROVISIONING-GUIDE.md
│   ├── api-dev/...
│   ├── agent-dev/...
│   ├── git-ops/...
│   ├── template-ops/...
│   ├── security-ops/...
│   ├── realtime-ops/...
│   └── tab-ops/...
├── plugin.json
└── README.md
```

## Contributing

When contributing to Vibe Anywhere, these agents will automatically assist you. To enhance the agents:

1. Identify missing patterns or outdated information
2. Edit the relevant agent file in `.claude/agents/`
3. Add examples to skill reference files
4. Test with actual development tasks
5. Commit changes to version control

## Support

For questions or issues with the plugin:
- Check agent documentation in `.claude/agents/`
- Review skill reference files in `.claude/skills/`
- Consult main project documentation in `CLAUDE.md`

## License

Same as Vibe Anywhere project

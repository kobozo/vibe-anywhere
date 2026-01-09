# Vibe Anywhere - Project Knowledge Base

## Project Overview
Vibe Anywhere is a web application for running persistent Claude Code CLI instances on a Linux server. It enables multiple parallel AI coding sessions, each isolated in its own Git worktree and Docker container.

## Tech Stack
- **Frontend**: Next.js 15, React 19, TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Real-time**: Socket.io
- **Terminal**: xterm.js
- **Containers**: Docker (Dockerode) or Proxmox LXC
- **Git**: simple-git
- **Auth**: Simple token-based (bcrypt)

## Development Rules

### Workflow
- Use comprehensive TODO lists to track all tasks
- Maximize parallel agent execution for efficiency
- Document all major decisions and configurations here
- All npm installations and dependencies managed through this project

### Code Standards
- Follow existing codebase patterns once established
- Keep solutions simple and focused
- Avoid over-engineering

### Agent Strategy
- Use `Explore` agents for codebase discovery
- Use `general-purpose` agents for complex multi-step tasks
- Use `Plan` agents for architectural decisions
- Run independent tasks in parallel whenever possible

### Database Changes
- NEVER modify the database directly with `db:push`
- ALWAYS use `npm run db:generate` after changing `src/lib/db/schema.ts`
- Run `npm run db:migrate` to apply migrations
- Commit migration files (`drizzle/*.sql`) to version control

### Agent Changes (packages/agent)
Every change to the agent requires a version bump. The server detects outdated agents and prompts users to update.

**Semantic Versioning (MAJOR.MINOR.PATCH):**
| Type | When to use | Example |
|------|-------------|---------|
| **MAJOR** | Breaking changes, protocol changes, incompatible API | Agent can't communicate with older server |
| **MINOR** | New features, new capabilities, backward compatible | Added new command support, new event handlers |
| **PATCH** | Bug fixes, small improvements, no new features | Fixed command display, performance tweaks |

**Files to update:**
1. `packages/agent/package.json` - bump `version` field
2. `src/lib/services/agent-registry.ts` - update `EXPECTED_AGENT_VERSION`

**After changes:**
```bash
cd packages/agent && npm run bundle
```

This creates `agent-bundle.tar.gz` which is served to containers for updates.

## Architecture

```
/home/devops/vibe-anywhere/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # REST API endpoints
│   │   └── page.tsx           # Main dashboard
│   ├── lib/
│   │   ├── db/               # Drizzle schema & client
│   │   ├── services/         # Business logic
│   │   │   ├── session-service.ts
│   │   │   ├── container-service.ts
│   │   │   ├── git-service.ts
│   │   │   └── auth-service.ts
│   │   └── websocket/        # Socket.io server
│   ├── components/           # React components
│   │   ├── terminal/        # xterm.js wrapper
│   │   └── sessions/        # Session management UI
│   └── hooks/               # React hooks
├── docker/                   # Docker-related files
│   └── claude-instance/     # Claude CLI container image
└── server.ts                # Custom Next.js + Socket.io server
```

## Key Files & Locations

| Purpose | Location |
|---------|----------|
| Database Schema | `src/lib/db/schema.ts` |
| Session Logic | `src/lib/services/session-service.ts` |
| Container Management | `src/lib/services/container-service.ts` |
| Git Worktrees | `src/lib/services/git-service.ts` |
| WebSocket Server | `src/lib/websocket/server.ts` |
| Terminal Component | `src/components/terminal/terminal.tsx` |
| API Routes | `src/app/api/sessions/` |
| Tech Stack Definitions | `src/lib/container/proxmox/tech-stacks.ts` |

## Commands

```bash
# Development
npm run dev              # Start dev server
npm run docker:up        # Start PostgreSQL
npm run docker:build     # Build Claude CLI image

# Setup
npm run setup            # Full setup (docker + db + image)

# Database
npm run db:generate      # Generate migration after schema changes
npm run db:migrate       # Apply migrations
npm run db:studio        # Open Drizzle Studio
npx tsx scripts/seed-user.ts [username] [password]  # Create user

# Production
npm run build            # Build for production
npm run start            # Start production server
```

## Environment Variables

See `.env.example` for all required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - Secret for token generation
- `BASE_REPO_PATH` - Git repository to create worktrees from (deprecated)
- `WORKTREE_BASE_PATH` - Where to store worktrees (deprecated)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate user |
| GET | `/api/sessions` | List sessions |
| POST | `/api/sessions` | Create session |
| GET | `/api/sessions/:id` | Get session |
| POST | `/api/sessions/:id` | Start session |
| DELETE | `/api/sessions/:id` | Delete session |
| POST | `/api/sessions/:id/attach` | Prepare for WebSocket |
| GET | `/api/sessions/:id/git/status` | Git status |
| GET | `/api/sessions/:id/git/diff` | Git diff |

## WebSocket Events

**Client → Server:**
- `session:attach` - Attach to session
- `terminal:input` - Send input to terminal
- `terminal:resize` - Resize terminal

**Server → Client:**
- `terminal:output` - Terminal output
- `terminal:buffer` - Reconnection buffer
- `session:attached` - Attachment confirmed
- `terminal:end` - Session ended
- `error` - Error message

## Proxmox Setup

### API Token Configuration

**⚠️ CRITICAL**: When creating a Proxmox API token for Vibe Anywhere, you **MUST** disable Privilege Separation.

```bash
# Create token without privilege separation
pveum user token add root@pam vibe-anywhere --privsep 0
```

**Why this matters:**
- API tokens with Privilege Separation enabled do NOT inherit user permissions
- Even root tokens will get `403 Permission Denied` errors when accessing storage
- Required permissions: `Datastore.Audit`, `Datastore.AllocateSpace`, `VM.*`, `Sys.*`
- Disabling privsep allows the token to inherit all permissions from the root user

**Symptoms of incorrect token setup:**
- Connection test succeeds ✓
- CT Templates list remains empty ✗
- Console shows: `403 Permission check failed (/storage/local, Datastore.Audit|Datastore.AllocateSpace)`

**Via Web UI:**
- Datacenter → Permissions → API Tokens → Add
- **UNCHECK "Privilege Separation"** checkbox
- This is the #1 issue users encounter during Proxmox setup

## Proxmox LXC Configuration

### Tech Stack Installation
Tech stacks (Node.js, Python, Claude CLI, etc.) are defined in `src/lib/container/proxmox/tech-stacks.ts`.

**Important**: All AI assistants (Claude, Gemini, Codex, etc.) are installed for the `kobozo` user, NOT globally as root. This avoids permission issues with auto-updates and configuration. The install scripts:
1. Create `~/.npm-global` directory for the user
2. Configure npm to use this local prefix
3. Add the path to `~/.bashrc`
4. Install packages as the `kobozo` user

### Template (VMID 150)
The Proxmox LXC template contains:
- Debian 12 (Bookworm)
- Node.js 22.x
- Docker
- Claude Code CLI (installed per-user in `~/.npm-global`)
- GitHub CLI (gh)
- tmux, git, vim, jq
- Vibe Anywhere Agent (systemd service)

### Container User
| Setting | Value |
|---------|-------|
| Username | `kobozo` |
| Password | `VibeAnywhere2024!` |
| Sudo | NOPASSWD (passwordless) |
| Groups | sudo, docker |
| Home | `/home/kobozo` |
| Workspace | `/workspace` (owned by kobozo) |

### Network
- Containers get DHCP IP on VLAN 2 (192.168.3.x)
- SSH enabled for rsync sync operations

## Troubleshooting

### `.next` Permission Denied During Build
If you see permission errors like `EACCES: permission denied, open '/home/devops/vibe-anywhere/.next/trace'`, the `.next` directory is owned by another user (likely root from a previous dev session).

**Fix:**
```bash
# Restart the dev Docker container to reset permissions
docker restart vibe-anywhere-dev

# Or if you have sudo access:
sudo rm -rf .next
npm run build
```

**Prevention**: The dev container runs as `devops` user. If you ever run `npm run dev` or `npm run build` as root, it will create files owned by root.

---
*Last updated: 2026-01-06*

# Vibe Anywhere - Project Knowledge Base

## Project Overview
Vibe Anywhere is a web application for persistent AI coding sessions on a Linux server. Your coding sessions, always running. It enables multiple parallel AI coding sessions, each isolated in its own Git worktree and container.

### Security Features

#### Forced Password Change
- Default admin user (`admin` / `vibe-anywhere`) must change password on first login
- Password requirements: 8+ characters, uppercase, lowercase, number
- Modal blocks all UI interaction until password is changed
- Password change clears `forcePasswordChange` flag in database and localStorage
- Implemented in: Auth service, auth hook, force password change modal

## Tech Stack
- **Frontend**: Next.js 15, React 19, TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Real-time**: Socket.io
- **Terminal**: xterm.js
- **Containers**: Proxmox LXC
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

**Agent Architecture:** Standalone binary (Node.js SEA) - no external Node.js required in containers.

**Semantic Versioning (MAJOR.MINOR.PATCH):**
| Type | When to use | Example |
|------|-------------|---------|
| **MAJOR** | Breaking changes, protocol changes, incompatible API | Agent can't communicate with older server, architecture changes |
| **MINOR** | New features, new capabilities, backward compatible | Added new command support, new event handlers |
| **PATCH** | Bug fixes, small improvements, no new features | Fixed command display, performance tweaks |

**Files to update:**
1. `packages/agent/package.json` - bump `version` field
2. `packages/vibe-anywhere-cli/package.json` - bump `version` field (keep in sync)
3. `src/lib/services/agent-registry.ts` - update `EXPECTED_AGENT_VERSION`

**Build process:**
```bash
cd packages/agent && npm run bundle
```

**What this does:**
1. Bundles agent code with esbuild (all dependencies included)
2. Creates Node.js SEA (Single Executable Application) binary
3. Bundles CLI helper tool
4. Creates `agent-bundle.tar.gz` (~8-12MB compressed)

**Bundle contents:**
- `dist/vibe-anywhere-agent` - Standalone binary (~25-35MB)
- `cli/vibe-anywhere` - CLI helper (~7KB)
- `package.json` - Metadata

**Update process:**
1. Agent downloads bundle from server
2. Extracts to `/opt/vibe-anywhere-agent-new`
3. Tests new binary
4. Atomically swaps directories
5. Systemd restarts service (~1-2 sec disconnect)
6. Agent auto-reconnects via WebSocket

**Benefits:**
- No Node.js installation required in containers
- No version conflicts with developer environments
- Self-contained deployment
- Simpler dependency management

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
├── packages/                 # Standalone packages
│   └── agent/               # Workspace agent (standalone binary)
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

# Setup
npm run setup            # Setup (db migrations)

# Database
npm run db:generate      # Generate migration after schema changes
npm run db:migrate       # Apply migrations
npm run db:studio        # Open Drizzle Studio
npx tsx scripts/seed-user.ts [username] [password]  # Create user

# Production
npm run build            # Build for production
npm run start            # Start production server
```

### Default Credentials

**Initial Admin User** (created via database migration):
- Username: `admin`
- Password: `vibe-anywhere`
- Token: *(generated per-install / stored in DB; rotate if exposed)*
- **⚠️ IMPORTANT:** You will be forced to change this password on first login

Users created via `seed-user.ts` script do not require forced password change.

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

### Creating a Proxmox LXC Template

**📖 Full Guide**: See `docs/PROXMOX-TEMPLATE-SETUP.md` for detailed instructions.

**Quick Steps:**
1. Create a base Debian 12 LXC container
2. Install base packages (git, curl, tmux, etc.)
3. Create `kobozo` user with NOPASSWD sudo
4. Copy and run the template preparation script:
   ```bash
   # Inside container
   export AGENT_URL="http://your-server:3000/api/workspaces/agent/bundle"
   /path/to/scripts/prepare-proxmox-template.sh
   ```
5. Stop container and convert to template

**⚠️ CRITICAL**: Always use `scripts/prepare-proxmox-template.sh` before creating the template. This ensures:
- Agent binary is installed correctly
- Systemd service uses binary (not Node.js)
- Workspace-specific config is cleared
- Service is disabled (enabled per workspace)
- Machine identifiers are reset

**Common Issue**: If agent doesn't connect after workspace creation, verify:
```bash
# Check systemd service is using binary
pct exec <vmid> -- grep ExecStart /etc/systemd/system/vibe-anywhere-agent.service
# Should show: ExecStart=/opt/vibe-anywhere-agent/dist/vibe-anywhere-agent
# NOT: ExecStart=/usr/bin/node /opt/vibe-anywhere-agent/dist/index.js
```

### Template (VMID 150)
The Proxmox LXC template contains:
- Debian 12 (Bookworm)
- Basic utilities: tmux, git, vim, curl, wget, sudo
- **Vibe Anywhere Agent v3.0.0** (standalone binary - no Node.js dependency)
  - Binary: `/opt/vibe-anywhere-agent/dist/vibe-anywhere-agent`
  - CLI: `/usr/local/bin/vibe-anywhere`
  - Systemd service (disabled in template, enabled per workspace)

**Optional** (can be installed via tech stacks):
- Node.js 22.x
- Claude Code CLI
- GitHub CLI (gh)
- Python, Rust, Go, etc.

### Container User
| Setting | Value |
|---------|-------|
| Username | `kobozo` |
| Password | `VibeAnywhere2024!` |
| Sudo | NOPASSWD (passwordless) |
| Groups | sudo |
| Home | `/home/kobozo` |
| Workspace | `/workspace` (owned by kobozo) |

### Network
- Containers get DHCP IP on VLAN 2 (192.168.3.x)
- SSH enabled for rsync sync operations

## Release and Versioning Strategy

### Branching Model

Vibe Anywhere uses **GitHub Flow** - a simple, branch-based workflow:
- `main` branch is always production-ready and deployable
- All development happens in feature branches (`feature/*`, `fix/*`, `docs/*`, etc.)
- Pull requests required for all changes to main
- Direct commits to main are blocked (branch protection)
- Releases are tagged from main

**Full details:** See [docs/BRANCHING.md](docs/BRANCHING.md)

### Version Numbering

**Semantic Versioning (semver):** `MAJOR.MINOR.PATCH[-PRERELEASE]`

**Main Application** (`package.json`):
- Current: `0.1.0`
- Follows standard semver
- Incremented with each release
- Examples: `1.0.0`, `1.1.0-beta.1`, `2.0.0`

**Agent** (`packages/agent/package.json`):
- Current: `3.0.0`
- Independent versioning
- Only bumped when agent code changes
- Must update `src/lib/services/agent-registry.ts` when changed

**When to Bump Versions:**
- **MAJOR** (x.0.0): Breaking changes, API changes, major rewrites
- **MINOR** (0.x.0): New features, backward compatible
- **PATCH** (0.0.x): Bug fixes, small improvements

### Release Types

**1. Stable Release** (`1.0.0`)
- Production-ready version
- Full testing completed
- Documentation updated
- Triggered manually via GitHub Actions

**2. Pre-Release** (`1.0.0-beta.1`, `1.0.0-rc.1`)
- Testing versions before stable
- Community feedback phase
- Marked as "pre-release" on GitHub
- Iterate until stable

**3. Hotfix Release** (`1.0.1`)
- Emergency fixes for critical production issues
- Created from release tag
- Minimal changes only
- Merged back to main

### Release Workflow

**Manual Process:**
1. Complete pre-release checklist (testing, docs, linting)
2. Go to GitHub Actions → Release workflow
3. Enter version number (e.g., `1.0.0`, `1.0.0-beta.1`)
4. Workflow builds and creates GitHub release
5. Verify release and update notes
6. Test installation from tarball

**Helper Scripts:**
- `scripts/prepare-release.sh` - Pre-release validation
- `scripts/version-bump.sh` - Consistent version bumping
- `scripts/apply-github-settings.sh` - Configure GitHub repo settings

**Full details:** See [docs/RELEASE.md](docs/RELEASE.md)

### Branch Protection Rules

**Main Branch Protection:**
- Pull requests required (no direct commits)
- At least 1 approval required
- Stale reviews dismissed on new commits
- No force pushes allowed
- No deletions allowed
- Rules enforced for administrators

**Applied via:** `scripts/apply-github-settings.sh`

### Hotfix Workflow

When critical bugs found in production:

```bash
# 1. Create hotfix branch from release tag
git checkout -b hotfix/v1.0.1 v1.0.0

# 2. Apply fix and test
# ... make changes ...
git commit -m "fix: critical issue description"

# 3. Bump version
npm version patch --no-git-tag-version
git add package.json
git commit -m "chore: bump version to 1.0.1"

# 4. Push and trigger release
git push origin hotfix/v1.0.1
# Trigger release workflow from GitHub Actions

# 5. Merge back to main
git checkout main
git merge hotfix/v1.0.1
git push origin main

# 6. Clean up
git branch -d hotfix/v1.0.1
git push origin --delete hotfix/v1.0.1
```

### Version Coordination

**Independent Versioning (Recommended):**
- Main app version reflects application changes
- Agent version only bumps when agent changes
- CLI version stays in sync with agent
- Document version differences in release notes

**Why Independent:**
- Agent at 3.0.0 is stable, no need to bump unnecessarily
- More accurate semantic versioning
- Users understand what changed

**When Agent Changes:**
1. Update `packages/agent/package.json`
2. Update `packages/vibe-anywhere-cli/package.json` (same version)
3. Update `src/lib/services/agent-registry.ts` (`EXPECTED_AGENT_VERSION`)
4. Rebuild agent: `cd packages/agent && npm run bundle`
5. Include agent update in main release notes

### Release Checklist Reference

**Pre-Release:**
- [ ] Code builds successfully
- [ ] Linting passes
- [ ] Manual testing completed
- [ ] Documentation updated
- [ ] Version numbers decided
- [ ] Agent version updated if needed

**Post-Release:**
- [ ] Verify release on GitHub
- [ ] Test installation script
- [ ] Verify tarball contents
- [ ] Close related issues
- [ ] Announce release

**Full checklist:** See `docs/RELEASE.md` or `.github/ISSUE_TEMPLATE/release_checklist.md`

## Troubleshooting

### `.next` Permission Denied During Build
If you see permission errors like `EACCES: permission denied, open '/home/devops/vibe-anywhere/.next/trace'`, the `.next` directory is owned by another user (likely root from a previous dev session).

**Fix:**
```bash
# If you have sudo access:
sudo rm -rf .next
npm run build
```

**Prevention**: If you run `npm run dev` or `npm run build` as root, it will create files owned by root.

---
*Last updated: 2026-01-09*

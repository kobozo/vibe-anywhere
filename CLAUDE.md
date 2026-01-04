# Session Hub - Project Knowledge Base

## Project Overview
Session Hub is a web application for running persistent Claude Code CLI instances on a Linux server. It enables multiple parallel AI coding sessions, each isolated in its own Git worktree and Docker container.

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

## Architecture

```
/home/devops/session-hub/
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

## Commands

```bash
# Development
npm run dev              # Start dev server
npm run docker:up        # Start PostgreSQL
npm run docker:build     # Build Claude CLI image
npm run db:push          # Push schema to database

# Setup
npm run setup            # Full setup (docker + db + image)

# Database
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
- `BASE_REPO_PATH` - Git repository to create worktrees from
- `WORKTREE_BASE_PATH` - Where to store worktrees
- `ANTHROPIC_API_KEY` - Claude API key for containers

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

## Proxmox LXC Configuration

### Template (VMID 150)
The Proxmox LXC template contains:
- Debian 12 (Bookworm)
- Node.js 22.x
- Docker 29.x
- Claude Code CLI 2.x
- tmux, git, lazygit, lazydocker
- Session Hub Agent (systemd service)

### Container User
| Setting | Value |
|---------|-------|
| Username | `kobozo` |
| Password | `SessionHub2024!` |
| Sudo | NOPASSWD (passwordless) |
| Groups | sudo, docker |
| Home | `/home/kobozo` |
| Workspace | `/workspace` (owned by kobozo) |

### Network
- Containers get DHCP IP on VLAN 2 (192.168.3.x)
- SSH enabled for rsync sync operations

---
*Last updated: 2026-01-03*

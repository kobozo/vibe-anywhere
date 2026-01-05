# Session Hub

A web application for running persistent Claude Code CLI instances on a Linux server with multiple parallel sessions.

## Features

- **Persistent Sessions**: Claude Code continues running even when you close your browser
- **Multiple Parallel Instances**: Run multiple AI coding agents simultaneously
- **Git Worktree Isolation**: Each session works in its own branch/worktree
- **Web Terminal**: Interactive terminal interface with xterm.js
- **Real-time Streaming**: Live output via WebSocket
- **Git Integration**: View diffs and status for each session
- **Docker or Proxmox**: Choose your container backend

## Quick Install

Install Session Hub as a service on Debian/Ubuntu with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/kobozo/session-hub/main/scripts/install.sh | sudo bash
```

The installer will:
- Prompt for all configuration (paths, backend, credentials)
- Install Node.js 22, PostgreSQL 16, and optionally Docker
- Set up the database and create an admin user
- Install and start the systemd service

After installation, access Session Hub at `http://your-server:51420`

## Manual Installation

### Prerequisites

- Debian 12+ or Ubuntu 22.04+
- Node.js 22+
- PostgreSQL 16+
- Docker (optional, for Docker container backend)
- Git

### Steps

```bash
# Clone the repository
git clone https://github.com/kobozo/session-hub.git
cd session-hub

# Install dependencies
npm install

# Start PostgreSQL (via Docker)
npm run docker:up

# Push database schema
npm run db:push

# Build Claude CLI Docker image (if using Docker backend)
npm run docker:build

# Create an admin user
npx tsx scripts/seed-user.ts admin yourpassword

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings

# Start the development server
npm run dev
```

Open http://localhost:3000 and log in with your credentials.

## Configuration

Copy `.env.example` to `.env` and configure:

```env
# Required
DATABASE_URL=postgresql://sessionhub:password@localhost:5432/sessionhub
AUTH_SECRET=your-secure-random-string

# Git paths
BASE_REPO_PATH=/path/to/your/git/project
WORKTREE_BASE_PATH=/path/to/worktrees

# Claude authentication (choose one)
ANTHROPIC_API_KEY=your-api-key  # Option 1: API key
# Or use OAuth flow (no key needed)

# Container backend
CONTAINER_BACKEND=docker  # or "proxmox"
```

See `.env.example` for all available options including Proxmox configuration.

## Service Management

If installed via the install script, Session Hub runs as a systemd service:

```bash
# Check status
sudo systemctl status session-hub

# Start/Stop/Restart
sudo systemctl start session-hub
sudo systemctl stop session-hub
sudo systemctl restart session-hub

# View logs
sudo journalctl -u session-hub -f

# View recent logs
sudo journalctl -u session-hub --since "1 hour ago"
```

Configuration file: `/opt/session-hub/.env`

## Usage

1. **Create a Session**: Click "New Session" and give it a name
2. **Start the Session**: Click "Start" to launch the container and worktree
3. **Attach**: Once running, click "Attach" to open the terminal
4. **Interact**: Use Claude Code as you normally would
5. **View Changes**: Check Git status/diff in the UI
6. **Stop/Delete**: Stop the session when done, or delete to clean up

## Architecture

- **Next.js 15** - React 19 frontend with API routes
- **Socket.io** - Real-time terminal communication
- **PostgreSQL + Drizzle** - Session persistence
- **Docker/Proxmox** - Container isolation for Claude instances
- **Git Worktrees** - Branch isolation for parallel work

See `CLAUDE.md` for detailed documentation.

## Development

```bash
npm run dev          # Start dev server
npm run db:studio    # Open Drizzle Studio (DB viewer)
npm run lint         # Run ESLint
npm run build        # Build for production
```

## Creating a Release

Releases are created via GitHub Actions:

1. Go to Actions > Release workflow
2. Click "Run workflow"
3. Enter the version number (e.g., `1.0.0`)
4. The workflow builds and publishes the release

## License

MIT

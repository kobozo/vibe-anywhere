![Vibe Anywhere Logo](./public/logo.svg)

# Vibe Anywhere

Your coding sessions, always running. A web application for persistent AI coding sessions on a Linux server.

## Features

- **Persistent Sessions**: Your AI coding session continues running even when you close your browser
- **Multiple Parallel Instances**: Run multiple AI coding agents simultaneously
- **Git Worktree Isolation**: Each session works in its own branch/worktree
- **Web Terminal**: Interactive terminal interface with xterm.js
- **Real-time Streaming**: Live output via WebSocket
- **Git Integration**: View diffs and status for each session
- **Docker or Proxmox**: Choose your container backend

## Quick Install

Install Vibe Anywhere as a service on Debian/Ubuntu with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/kobozo/vibe-anywhere/main/scripts/install.sh | sudo bash
```

The installer will:
- Prompt for all configuration (paths, backend, credentials)
- Install Node.js 22, PostgreSQL 16, and optionally Docker
- Set up the database and create an admin user
- Install and start the systemd service

After installation, access Vibe Anywhere at `http://your-server:51420`

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
git clone https://github.com/kobozo/vibe-anywhere.git
cd vibe-anywhere

# Install dependencies
npm install

# Start PostgreSQL (via Docker)
npm run docker:up

# Push database schema
npm run db:push

# Build AI container image (if using Docker backend)
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

# Git paths (deprecated - repos are now cloned in containers)
BASE_REPO_PATH=/path/to/your/git/project
WORKTREE_BASE_PATH=/path/to/worktrees

# Container backend
CONTAINER_BACKEND=docker  # or "proxmox"
```

See `.env.example` for all available options including Proxmox configuration.

## Proxmox Setup

If using Proxmox as your container backend, you need to create an API token with proper permissions.

### Creating a Proxmox API Token

**⚠️ IMPORTANT**: The API token **MUST** be created with **Privilege Separation DISABLED** to work correctly.

#### Via Proxmox Web UI:

1. Navigate to **Datacenter** → **Permissions** → **API Tokens**
2. Click **Add**
3. Select user: `root@pam` (or your preferred user)
4. Enter token ID: `vibe-anywhere` (or your preferred name)
5. **⚠️ UNCHECK "Privilege Separation"** - This is critical!
6. Click **Add**
7. **Copy the token secret** - it's only shown once!

#### Via Proxmox Shell:

```bash
# Create token without privilege separation (inherits all user permissions)
pveum user token add root@pam vibe-anywhere --privsep 0

# This will output the token secret - save it!
```

### Why Disable Privilege Separation?

When Privilege Separation is enabled, the API token does NOT inherit the user's permissions. Vibe Anywhere needs these permissions:
- `Datastore.Audit` - To list and access storage containing CT templates
- `Datastore.AllocateSpace` - To create containers
- `VM.Allocate`, `VM.Config.*`, `VM.Console`, `VM.PowerMgmt` - To manage containers
- `Pool.Audit`, `Sys.Audit`, `Sys.Modify` - For resource management

Disabling privilege separation allows the token to inherit all permissions from the root user, avoiding permission issues.

### Required Proxmox Storage Configuration

Make sure you have a storage configured with CT template support:
- Storage must have `vztmpl` content type enabled
- Common storage names: `local`, `local-zfs`, `local-btrfs`
- Check storage config: `pvesm status` (shows available storages and their content types)

### Troubleshooting

**CT Templates list is empty after configuration:**
- Check API token privilege separation is disabled: `pveum user token list root@pam`
- Verify storage has vztmpl content: `pvesm status | grep vztmpl`
- Check console logs: `docker logs vibe-anywhere-dev` (look for `[CT Templates]` messages)

## Service Management

If installed via the install script, Vibe Anywhere runs as a systemd service:

```bash
# Check status
sudo systemctl status vibe-anywhere

# Start/Stop/Restart
sudo systemctl start vibe-anywhere
sudo systemctl stop vibe-anywhere
sudo systemctl restart vibe-anywhere

# View logs
sudo journalctl -u vibe-anywhere -f

# View recent logs
sudo journalctl -u vibe-anywhere --since "1 hour ago"
```

Configuration file: `/opt/vibe-anywhere/.env`

## Usage

1. **Create a Session**: Click "New Session" and give it a name
2. **Start the Session**: Click "Start" to launch the container and worktree
3. **Attach**: Once running, click "Attach" to open the terminal
4. **Interact**: Use your AI coding assistant as you normally would
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

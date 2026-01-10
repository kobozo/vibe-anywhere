<div align="center">
  <img src="./public/logo.svg" alt="Vibe Anywhere Logo" width="120" height="120">

  # Vibe Anywhere

  **Your AI coding sessions, always running.**

  A self-hosted web platform for persistent AI-assisted development environments on your own infrastructure.

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

</div>

---

## Overview

Vibe Anywhere gives you a persistent, multi-session AI coding environment that runs on your own Linux server. Each session is isolated in its own container and Git worktree, allowing you to work on multiple features simultaneously without interference. Close your browser, come back later—your sessions are still running.

Perfect for developers who want:
- 24/7 AI coding assistance without cloud dependency
- Multiple parallel development streams
- Complete control over their development environment
- Seamless Git integration with automatic branch management

## Key Features

- **Persistent Sessions** - AI coding sessions continue running even when you disconnect
- **Parallel Workspaces** - Run multiple AI agents simultaneously, each in isolated environments
- **Git Worktree Integration** - Automatic branch and worktree management per session
- **Interactive Web Terminal** - Full terminal access via xterm.js with real-time streaming
- **Proxmox LXC Containers** - Isolated workspace environments using Proxmox
- **Live Git Diff Viewer** - See code changes in real-time from the web UI
- **WebSocket Communication** - Low-latency, real-time terminal interaction

## Quick Start

### One-Line Installation

For Debian/Ubuntu systems, install as a systemd service:

```bash
curl -fsSL https://raw.githubusercontent.com/kobozo/vibe-anywhere/main/scripts/install.sh | sudo bash
```

The installer handles everything:
- Installs Node.js 22 and PostgreSQL 16
- Sets up the database and creates an admin user
- Configures and starts the systemd service
- Prompts for all necessary configuration (including Proxmox connection)

After installation, access the web UI at `http://your-server:51420`

### Development Setup

For local development or manual installation:

```bash
# Clone the repository
git clone https://github.com/kobozo/vibe-anywhere.git
cd vibe-anywhere

# Install dependencies
npm install

# Set up the environment
cp .env.example .env
# Edit .env with your Proxmox configuration

# Set up PostgreSQL (you'll need a running PostgreSQL instance)
# Update DATABASE_URL in .env

# Initialize the database
npm run db:migrate

# Create an admin user
npx tsx scripts/seed-user.ts admin your-secure-password

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with your credentials.

## System Requirements

### Minimum Requirements
- **OS**: Debian 12+ or Ubuntu 22.04+
- **Node.js**: 22.x or higher
- **PostgreSQL**: 16+
- **Git**: 2.30+
- **RAM**: 4GB (8GB+ recommended for multiple sessions)
- **Storage**: 20GB+ (depends on workspace size)

### Container Backend
- **Proxmox VE**: 8.0+ (for isolated workspace containers)

## Configuration

All configuration is managed through environment variables. Copy `.env.example` to `.env` and customize:

```env
# Database
DATABASE_URL=postgresql://sessionhub:password@localhost:5432/sessionhub

# Authentication
AUTH_SECRET=your-secure-random-string-here

# Container Backend (Proxmox)
CONTAINER_BACKEND=proxmox

# Port (default: 3000 in dev, 51420 in production)
PORT=3000
```

For Proxmox configuration, additional variables are required:
```env
PROXMOX_HOST=your-proxmox-host
PROXMOX_TOKEN_ID=root@pam!vibe-anywhere
PROXMOX_TOKEN_SECRET=your-token-secret
PROXMOX_NODE=pve
PROXMOX_STORAGE=local
PROXMOX_TEMPLATE_ID=150
```

See [Proxmox Setup Guide](#proxmox-setup) for detailed instructions.

## Usage

### Creating and Managing Sessions

1. **Create a Workspace**
   - Click "New Session" in the dashboard
   - Enter a name and select configuration options
   - Choose your tech stack (Node.js, Python, etc.)

2. **Start the Session**
   - Click "Start" to provision the container
   - The system creates an isolated Git worktree and container
   - Status updates in real-time

3. **Attach and Code**
   - Click "Attach" to open the web terminal
   - Your AI coding assistant is ready to use
   - All work is automatically saved

4. **Monitor Changes**
   - View Git status and diffs from the UI
   - Track all modifications in real-time
   - Commit or reset as needed

5. **Stop or Delete**
   - Stop when pausing work (preserves state)
   - Delete to clean up container and worktree

## Proxmox Setup

### Creating an API Token

**Critical**: API tokens must have Privilege Separation **disabled** to work correctly.

**Via Web UI:**
1. Navigate to **Datacenter → Permissions → API Tokens**
2. Click **Add**
3. User: `root@pam`, Token ID: `vibe-anywhere`
4. **UNCHECK "Privilege Separation"** ⚠️
5. Save the token secret (shown only once)

**Via CLI:**
```bash
pveum user token add root@pam vibe-anywhere --privsep 0
```

### Why Disable Privilege Separation?

Tokens with Privilege Separation inherit no permissions by default. Vibe Anywhere requires:
- `Datastore.Audit`, `Datastore.AllocateSpace` - Storage access
- `VM.Allocate`, `VM.Config.*`, `VM.PowerMgmt` - Container management
- `Sys.Audit`, `Sys.Modify` - System operations

Disabling privilege separation allows the token to inherit root permissions.

### Storage Requirements

Ensure your Proxmox storage supports LXC templates:
```bash
pvesm status  # Check available storages
# Look for entries with "vztmpl" content type
```

Common storage names: `local`, `local-zfs`, `local-btrfs`

### Troubleshooting

**Empty CT Templates list:**
- Verify privilege separation is disabled: `pveum user token list root@pam`
- Check storage has `vztmpl` content: `pvesm status | grep vztmpl`
- Review server logs: `journalctl -u vibe-anywhere -f`

## Architecture

```
┌─────────────────────────────────────────────┐
│           Next.js Frontend                  │
│  (React 19, TypeScript, Tailwind CSS)      │
└──────────────┬──────────────────────────────┘
               │
               │ HTTP/WebSocket
               ▼
┌─────────────────────────────────────────────┐
│         Node.js Backend                     │
│  • API Routes (Next.js)                    │
│  • Socket.io WebSocket Server              │
│  • Session Management Service              │
└──────┬──────────────────────┬───────────────┘
       │                      │
       │                      │
       ▼                      ▼
┌─────────────┐      ┌──────────────────────┐
│ PostgreSQL  │      │  Container Backend   │
│  (Drizzle)  │      │  • Proxmox LXC       │
│             │      │                      │
└─────────────┘      └──────────┬───────────┘
                                 │
                                 ▼
                     ┌──────────────────────┐
                     │  LXC Containers      │
                     │  • Git Repositories │
                     │  • AI Agent         │
                     │  • Terminal (PTY)   │
                     └──────────────────────┘
```

### Tech Stack
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Node.js, Socket.io, Drizzle ORM
- **Database**: PostgreSQL 16
- **Containers**: Proxmox LXC
- **Terminal**: xterm.js with WebSocket streaming
- **Git**: simple-git for repository management

## Development

### Available Scripts

```bash
npm run dev          # Start development server (localhost:3000)
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:studio    # Open Drizzle Studio (database GUI)
npm run db:generate  # Generate migration after schema changes
npm run db:migrate   # Apply database migrations
```

### Project Structure

```
vibe-anywhere/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── api/         # REST API endpoints
│   │   └── page.tsx     # Main dashboard
│   ├── components/      # React components
│   ├── lib/
│   │   ├── db/         # Database schema and client
│   │   ├── services/   # Business logic layer
│   │   └── websocket/  # Socket.io server
│   └── hooks/          # Custom React hooks
├── scripts/            # Setup and utility scripts
└── packages/
    └── agent/         # Container agent (standalone binary)
```

### Making Changes

1. **Database Schema**: Edit `src/lib/db/schema.ts`, then run `npm run db:generate`
2. **API Routes**: Add/modify files in `src/app/api/`
3. **UI Components**: Update components in `src/components/`
4. **Services**: Business logic lives in `src/lib/services/`

Detailed development docs: [CLAUDE.md](CLAUDE.md)

## Service Management

When installed via the install script:

```bash
# Service status
sudo systemctl status vibe-anywhere

# Control the service
sudo systemctl start vibe-anywhere
sudo systemctl stop vibe-anywhere
sudo systemctl restart vibe-anywhere

# View logs
sudo journalctl -u vibe-anywhere -f

# View logs from last hour
sudo journalctl -u vibe-anywhere --since "1 hour ago"
```

Configuration: `/opt/vibe-anywhere/.env`

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Commit with clear messages: `git commit -m 'Add amazing feature'`
5. Push to your fork: `git push origin feature/amazing-feature`
6. Open a Pull Request

Please ensure:
- Code follows existing style conventions
- All tests pass
- Commit messages are descriptive
- PR includes description of changes

## Creating a Release

Releases are automated via GitHub Actions:

1. Go to **Actions → Release workflow**
2. Click **Run workflow**
3. Enter version number (e.g., `1.2.0`)
4. The workflow builds and publishes automatically

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/kobozo/vibe-anywhere/issues)
- **Discussions**: [GitHub Discussions](https://github.com/kobozo/vibe-anywhere/discussions)
- **Documentation**: [CLAUDE.md](CLAUDE.md)

---

<div align="center">
  Made with ❤️ by the Vibe Anywhere community
</div>

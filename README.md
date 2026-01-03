# Session Hub

A web application for running persistent Claude Code CLI instances on a Linux server with multiple parallel sessions.

## Features

- **Persistent Sessions**: Claude Code continues running even when you close your browser
- **Multiple Parallel Instances**: Run multiple AI coding agents simultaneously
- **Git Worktree Isolation**: Each session works in its own branch/worktree
- **Web Terminal**: Interactive terminal interface with xterm.js
- **Real-time Streaming**: Live output via WebSocket
- **Git Integration**: View diffs and status for each session
- **Docker Isolation**: Optional containerization for security

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL (or use Docker)
- Git repository to work with

### Setup

```bash
# Install dependencies
npm install

# Start PostgreSQL (via Docker)
npm run docker:up

# Push database schema
npm run db:push

# Build Claude CLI Docker image
npm run docker:build

# Create an admin user
npx tsx scripts/seed-user.ts admin yourpassword

# Start the development server
npm run dev
```

Open http://localhost:3000 and log in with your credentials.

### Configuration

Copy `.env.example` to `.env.local` and configure:

```env
DATABASE_URL=postgresql://sessionhub:sessionhub_dev_password@localhost:5432/sessionhub
AUTH_SECRET=change-this-to-a-secure-random-string
BASE_REPO_PATH=/path/to/your/git/project
WORKTREE_BASE_PATH=/tmp/session-hub-worktrees
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Usage

1. **Create a Session**: Click "New Session" and give it a name
2. **Start the Session**: Click "Start" to launch the container and worktree
3. **Attach**: Once running, click "Attach" to open the terminal
4. **Interact**: Use Claude Code as you normally would
5. **View Changes**: Check Git status/diff in the UI
6. **Stop/Delete**: Stop the session when done, or delete to clean up

## Architecture

- **Next.js** - React frontend with API routes
- **Socket.io** - Real-time terminal communication
- **PostgreSQL + Drizzle** - Session persistence
- **Docker** - Container isolation for Claude instances
- **Git Worktrees** - Branch isolation for parallel work

See `CLAUDE.md` for detailed documentation.

## Development

```bash
npm run dev          # Start dev server
npm run db:studio    # Open Drizzle Studio (DB viewer)
npm run lint         # Run ESLint
```

## License

MIT
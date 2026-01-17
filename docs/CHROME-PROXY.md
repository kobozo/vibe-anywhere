# Chrome Browser Control via Tailscale

This feature allows Claude Code running in workspace containers to control a Chrome browser on your MacBook via Tailscale networking.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        MacBook (MacOS)                       │
│                                                              │
│  ┌──────────────┐    Unix Socket     ┌──────────────────┐  │
│  │ Claude Code  │ ←─────────────────→ │ Native Messaging │  │
│  │  --chrome    │  /tmp/claude-mcp-   │      Host        │  │
│  └──────────────┘   browser-bridge    └──────────────────┘  │
│         ↑                                       ↓            │
│         │                              ┌──────────────────┐  │
│         │                              │ Chrome Extension │  │
│         │                              │ "Claude in Chrome"│ │
│         │                              └──────────────────┘  │
│         ↓                                       ↓            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            TCP Bridge Server (port 19222)            │   │
│  │        Forwards Unix Socket → TCP over Tailscale     │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────────┬──────────────────────────────┘
                                │ Tailscale VPN
                                │ (Mesh Network)
┌───────────────────────────────┴──────────────────────────────┐
│                   Workspace Container (LXC)                   │
│                                                               │
│  ┌──────────────┐    Unix Socket     ┌──────────────────┐   │
│  │ Claude Code  │ ←─────────────────→ │ Unix Socket Proxy│   │
│  │  --chrome    │  /tmp/claude-mcp-   │   (Agent v3.1.4) │   │
│  └──────────────┘   browser-bridge    └──────────────────┘   │
│                                                ↓              │
│                                        ┌──────────────────┐   │
│                                        │  TCP Client      │   │
│                                        │  → MacBook:19222 │   │
│                                        └──────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

## How It Works

1. **MacBook Side:**
   - Chrome with "Claude in Chrome" extension installed
   - Native messaging host bridges MCP protocol to Chrome extension
   - TCP bridge server listens on Tailscale IP port 19222
   - Forwards TCP connections to Unix socket

2. **Container Side:**
   - Agent creates Unix socket proxy at `/tmp/claude-mcp-browser-bridge-{user}`
   - Proxy connects to MacBook's TCP bridge server over Tailscale
   - Claude Code sees "local" Chrome via Unix socket

3. **Communication Flow:**
   - Claude Code in container → Unix socket → Agent proxy → TCP over Tailscale
   - → MacBook TCP bridge → Unix socket → Native messaging host → Chrome extension

## Setup

### 1. Local Machine Prerequisites

**Supported Platforms:** MacOS, Linux, Windows

**Requirements:**
- Chrome/Chromium browser (version 143+)
- Claude Code CLI installed: [claude.com/claude-code](https://claude.com/claude-code)
- "Claude in Chrome" extension installed
- Tailscale connected
- Node.js 18+ (if running as script)

### 2. Start Bridge Server on Your Local Machine

**Option A: Download and Run Script (All Platforms)**

```bash
# Download the bridge script from your Vibe Anywhere server
curl -O http://your-vibe-server:3000/api/chrome-bridge/download

# Rename and make executable (Mac/Linux)
mv download chrome-bridge.js
chmod +x chrome-bridge.js

# Run the bridge server
node chrome-bridge.js
```

**On Windows (PowerShell):**
```powershell
# Download
Invoke-WebRequest -Uri http://your-vibe-server:3000/api/chrome-bridge/download -OutFile chrome-bridge.js

# Run
node chrome-bridge.js
```

**Option B: Use Pre-built Binary (Linux/MacOS)**

```bash
# Download platform-specific binary
# Linux:
curl -O http://your-vibe-server:3000/api/chrome-bridge/linux

# MacOS:
curl -O http://your-vibe-server:3000/api/chrome-bridge/macos

# Make executable and run
chmod +x chrome-bridge-*
./chrome-bridge-linux   # or ./chrome-bridge-macos
```

You should see:
```
============================================================
Claude Code Chrome MCP Bridge Server
============================================================
Platform: MacOS (or Linux/Windows)
User: yourname
Tailscale IP: 100.x.x.x
TCP Port: 19222
Socket: /tmp/claude-mcp-browser-bridge-yourname
============================================================
✓ MCP bridge socket found: /tmp/claude-mcp-browser-bridge-yourname
✓ Bridge server listening on 0.0.0.0:19222

Remote containers can now connect via: 100.x.x.x:19222
```

**Note:** If you see a warning about the socket not found, start Claude Code with `--chrome` first:

```bash
claude --chrome
```

### 3. Connect Workspace to Chrome

1. Open your workspace in Vibe Anywhere
2. Go to the **Network** tab
3. Ensure Tailscale is connected (you should see your Tailscale IP)
4. In the **Chrome Browser Control** section:
   - Select your MacBook from the dropdown (shows Tailscale peers)
   - The dropdown shows: `hostname (100.x.x.x)`

### 4. Use Claude Code with Remote Chrome

In your workspace terminal:

```bash
# Start Claude Code with Chrome support
claude --chrome

# Claude Code will detect the "local" Chrome (actually proxied to MacBook)
# You can now use browser control features
```

## Verification

**On MacBook:**
- Bridge server should show: `Client connected: 100.x.x.x:xxxxx`
- Bridge server should show: `Connected to MCP bridge socket`

**On Container:**
- Agent logs: `[Socket Proxy] Client connected to local Unix socket`
- Agent logs: `[Socket Proxy] Connected to remote 100.x.x.x:19222`

**In Claude Code:**
- Should detect Chrome browser
- Browser control commands should work

## Troubleshooting

### MacBook: "MCP bridge socket not found"

**Cause:** Claude Code is not running with `--chrome` flag, or native messaging host not installed.

**Fix:**
```bash
# Start Claude Code with Chrome support
claude --chrome

# Verify extension is installed
ls -la ~/Library/Application\ Support/Google/Chrome/Default/Extensions/ | grep -i claude

# Verify native messaging host
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json
```

### Container: "Remote socket error: ECONNREFUSED"

**Cause:** MacBook bridge server is not running, or firewall is blocking port 19222.

**Fix:**
1. Verify bridge server is running on MacBook
2. Check MacBook firewall settings (allow incoming on port 19222)
3. Verify Tailscale connectivity:
   ```bash
   # On container
   ping 100.x.x.x  # MacBook's Tailscale IP
   ```

### Container: Claude Code doesn't detect Chrome

**Cause:** Fake Chrome binary not created, or PATH not updated.

**Fix:**
```bash
# Verify fake Chrome exists
ls -la ~/.local/bin/chromium
~/.local/bin/chromium --version

# Add to PATH if needed
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Restart terminal or start new Claude Code session
```

### MacBook: "Port 19222 is already in use"

**Cause:** Bridge server already running, or another service using the port.

**Fix:**
```bash
# Find what's using the port
lsof -i :19222

# Kill the process if it's a stale bridge server
kill <PID>

# Or use a different port (requires agent code changes)
```

## Security Considerations

1. **Firewall:** The bridge server listens on `0.0.0.0:19222` (all interfaces), allowing Tailscale connections.

2. **Tailscale Network:** All traffic is encrypted via Tailscale VPN mesh network.

3. **Access Control:** Only devices on your Tailscale network can connect to port 19222.

4. **Chrome Extension:** Uses Chrome's native messaging API - same security as running Claude Code locally.

## Agent Version

This feature requires **Agent v3.1.4+**.

Check your agent version:
```bash
vibe-anywhere version
```

Update if needed - the Vibe Anywhere UI will prompt you when an update is available.

## Implementation Details

### Agent Components

- **`chrome-proxy-handler.ts`** - Main Chrome proxy coordinator
  - Creates fake Chrome binary at `~/.local/bin/chromium`
  - Manages CDP proxy (for debugging, not used by `--chrome`)
  - Manages Unix socket proxy

- **`socket-proxy-handler.ts`** - Unix socket proxy
  - Creates Unix socket at `/tmp/claude-mcp-browser-bridge-{user}`
  - Connects to remote TCP port 19222 over Tailscale
  - Bidirectional stream piping

### Database Schema

- **`workspaces.chromeTailscaleHost`** - Stores selected Chrome device's Tailscale IP

### WebSocket Events

- **`chrome:host-update`** - Server → Agent when user selects Chrome device
  - Payload: `{ chromeHost: string | null }`
  - Triggers agent to start/stop socket proxy

## Why is `claude --chrome` still needed?

You might wonder: "If we're proxying the socket, why do I still need to run `claude --chrome` locally?"

**Answer:** The `--chrome` flag does critical setup:

1. **Installs Native Messaging Host** - Claude Code installs `~/.claude/chrome/chrome-native-host` which bridges MCP ↔ Chrome extension
2. **Creates the MCP Socket** - Claude Code creates `/tmp/claude-mcp-browser-bridge-{user}` that our bridge proxies
3. **Manages Chrome Extension** - The native messaging host communicates with the Chrome extension using Chrome's native messaging API

**What our bridge does:** It simply extends that local socket over the network via Tailscale. The bridge doesn't replace Claude Code's Chrome integration - it makes it accessible remotely.

**In the container:**
- The agent creates a "fake" socket that looks local to Claude Code
- Claude Code connects to this socket thinking it's local
- The agent proxies the connection to your actual machine over Tailscale

## Limitations

1. **One Chrome per workspace** - Each workspace can connect to one Chrome instance
2. **Requires Tailscale** - Both local machine and container must be on same Tailscale network
3. **Manual bridge server** - User must run bridge server locally (could be automated with systemd/launchd/Task Scheduler)
4. **Claude Code required on both sides** - Need `claude --chrome` on local machine, and `claude --chrome` in container

## Future Improvements

- [ ] Auto-start bridge server via launchd (MacOS), systemd (Linux), Task Scheduler (Windows)
- [ ] Pre-built binaries for all platforms (currently Linux only)
- [ ] Web UI to show Chrome connection status and bridge server status
- [ ] Reconnection logic for bridge server restarts
- [ ] Multiple Chrome instances per workspace (tabs)
- [ ] Auto-discovery of Chrome instances on Tailscale network (mDNS/Bonjour)

---

**Last Updated:** 2025-01-17
**Agent Version:** 3.1.4

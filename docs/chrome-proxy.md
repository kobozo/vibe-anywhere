# Chrome Browser Control via Tailscale

This guide explains how to control Chrome on your Mac/PC from Claude Code running in a Vibe Anywhere workspace via Tailscale VPN.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Mac/PC (Local Machine)                                          │
│                                                                 │
│  Chrome Browser                                                 │
│       ↕                                                         │
│  Chrome Extension (Claude Code)                                │
│       ↕                                                         │
│  Native Host Script (chrome-native-host)                       │
│       ↕                                                         │
│  TCP → Tailscale (100.x.x.x:19223)                            │
└─────────────────────────────────────────────────────────────────┘
                         ↓
              (Tailscale VPN)
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ Workspace (LXC Container)                                       │
│                                                                 │
│  MCP Reverse Proxy (Agent - Port 19223)                       │
│       ↕                                                         │
│  Claude Code MCP Socket (/tmp/claude-mcp-browser-bridge-*)    │
│       ↕                                                         │
│  Claude Code CLI (--chrome)                                    │
└─────────────────────────────────────────────────────────────────┘
```

## How It Works

### 1. Chrome Extension on Local Machine
- Installed in Chrome on your Mac/PC
- Provides browser control capabilities to Claude Code
- Communicates via Chrome Native Messaging protocol

### 2. Native Host Script (on Mac/PC)
- Acts as a bridge between Chrome extension and remote workspace
- Connects to workspace via Tailscale VPN
- Path configured in: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`

### 3. MCP Reverse Proxy (in Workspace)
- Runs as part of the Vibe Anywhere agent
- Listens on TCP port 19223 (all interfaces)
- Forwards to Claude Code's local MCP socket

### 4. Claude Code (in Workspace)
- Runs with `--chrome` flag
- Creates MCP socket: `/tmp/claude-mcp-browser-bridge-{user}`
- Controls browser through the chain above

## Setup Instructions

### Prerequisites

1. **Tailscale VPN** installed and running on both Mac/PC and workspace
2. **Chrome Extension** installed from Chrome Web Store (search "Claude Browser Extension")
3. **Workspace** must have `tailscale-vpn` tech stack installed

### Mac/PC Setup

#### Step 1: Install Chrome Extension

1. Open Chrome and go to: https://chromewebstore.google.com
2. Search for "Claude Browser Extension" or "Claude Code Browser Extension"
3. Click "Add to Chrome"
4. Grant the necessary permissions

#### Step 2: Get Workspace Tailscale IP

In the Vibe Anywhere dashboard:
1. Go to workspace settings
2. Open Tailscale settings modal
3. Note the workspace Tailscale IP (e.g., `100.65.1.110`)

#### Step 3: Install Native Host Script

**Option A: Download from Dashboard (Recommended)**

1. In Tailscale settings modal, find "Chrome Native Host Setup"
2. Click "Copy Script" to copy the native host script
3. Find your native host path:
   ```bash
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json
   ```
   Look for the `"path"` field (e.g., `/Users/yourname/.claude/chrome/chrome-native-host`)

4. Backup original and save new script:
   ```bash
   # Backup
   cp /path/to/chrome-native-host /path/to/chrome-native-host.backup

   # Paste the copied script
   nano /path/to/chrome-native-host
   # (paste, save, exit)

   # Make executable
   chmod +x /path/to/chrome-native-host
   ```

**Option B: Manual Creation**

Create a file at the native host path with this content:

```javascript
#!/usr/bin/env node
const net = require('net');

// Replace with your workspace Tailscale IP
const WORKSPACE_HOST = '100.65.1.110';
const WORKSPACE_PORT = 19223;

const socket = net.connect(WORKSPACE_PORT, WORKSPACE_HOST);

socket.on('connect', () => {
  console.error('[Native Host] Connected to workspace');
});

socket.on('data', (data) => process.stdout.write(data));
process.stdin.on('data', (data) => socket.write(data));

socket.on('error', (err) => {
  console.error('[Native Host] Error:', err.message);
  process.exit(1);
});

socket.on('end', () => process.exit(0));
process.stdin.on('end', () => socket.end());
```

Then:
```bash
chmod +x /path/to/chrome-native-host
```

#### Step 4: Verify Setup

1. Make sure Chrome is running with the extension enabled
2. Check Chrome extensions page: `chrome://extensions/`
3. Ensure "Claude Code Browser Extension" is enabled

### Workspace Setup

The workspace agent automatically sets up the MCP reverse proxy when:
1. Tailscale is installed (via `tailscale-vpn` tech stack)
2. Agent version 3.2.6 or later is installed

**Verification:**

```bash
# Check agent version
cat /opt/vibe-anywhere-agent/package.json | grep version

# Check if MCP reverse proxy is listening
ss -tlnp | grep 19223

# Check agent logs
journalctl -u vibe-anywhere-agent -f
```

You should see:
```
[MCP Reverse Proxy] Starting TCP server on port 19223
[MCP Reverse Proxy] Listening on 0.0.0.0:19223
```

## Testing the Connection

### Test 1: Version Query

From the workspace:
```bash
# This tests the proxy without Claude Code
echo '{"type":"version"}' | nc -v <workspace-tailscale-ip> 19223
```

### Test 2: Claude Code with Chrome

In the workspace terminal:
```bash
cd /workspace
claude --chrome
```

You should see:
```
Claude in Chrome (Beta)

Status: Enabled
Extension: Connected ✓
```

### Test 3: Browser Control

In the workspace:
```bash
cd /workspace
echo "Open google.com in Chrome" | claude --chrome
```

**Expected behavior:**
- Mac/PC: Chrome opens and navigates to google.com
- Workspace: Claude responds with confirmation
- Logs: Connection activity in agent logs and native host stderr

## Troubleshooting

### Extension Not Detected

**Symptoms:**
- Workspace shows "Extension: Not detected"
- No connection in agent logs

**Solutions:**
1. Verify Chrome extension is installed and enabled
2. Check native host path in manifest
3. Test native host manually:
   ```bash
   echo '{"test": true}' | /path/to/chrome-native-host
   ```
4. Check Tailscale connectivity:
   ```bash
   # From Mac
   ping <workspace-tailscale-ip>
   ```

### Connection Refused

**Symptoms:**
- Native host logs: "Connection refused"
- Agent shows MCP reverse proxy listening

**Solutions:**
1. Verify workspace Tailscale IP is correct in native host
2. Check firewall allows port 19223
3. Ensure agent is running: `systemctl status vibe-anywhere-agent`

### MCP Socket Not Found

**Symptoms:**
- Agent logs: "MCP socket error: ENOENT"
- Reverse proxy can't connect to local socket

**Solutions:**
1. Make sure Claude Code is running with `--chrome` in the workspace
2. Check socket exists: `ls -la /tmp/claude-mcp-browser-bridge-*`
3. Socket is created when Claude Code starts with `--chrome` flag

### Permission Issues

**Symptoms:**
- Native host script won't execute
- "Permission denied" errors

**Solutions:**
```bash
# Make script executable
chmod +x /path/to/chrome-native-host

# Verify ownership
ls -la /path/to/chrome-native-host
```

## Network Ports

| Port  | Direction | Purpose |
|-------|-----------|---------|
| 19223 | Mac → Workspace | MCP reverse proxy (native host → Claude Code) |
| 19222 | Workspace → Mac | Chrome bridge (future: CDP proxy, currently unused) |

## Security Considerations

1. **Tailscale VPN**: All traffic encrypted via WireGuard
2. **Localhost binding**: MCP socket only accessible locally in workspace
3. **User isolation**: Each user gets their own MCP socket path
4. **No internet exposure**: Ports only accessible via Tailscale

## File Locations

### Mac/PC
| Purpose | Location |
|---------|----------|
| Native host manifest | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json` |
| Native host script | Path specified in manifest (typically `~/.claude/chrome/chrome-native-host`) |
| Chrome extension | Installed via Chrome Web Store |

### Workspace
| Purpose | Location |
|---------|----------|
| MCP reverse proxy | Part of agent (v3.2.6+) |
| MCP socket | `/tmp/claude-mcp-browser-bridge-{user}` |
| Agent logs | `journalctl -u vibe-anywhere-agent` |
| Tailscale config | `/var/lib/tailscale/` |

## Agent Version Requirements

- **Minimum version**: 3.2.6
- **Includes**:
  - MCP Reverse Proxy on port 19223
  - Automatic Tailscale status reporting
  - Native host auto-replacement (workspace side, not needed for remote control)

## Advanced: Multiple Workspaces

Each workspace has its own Tailscale IP. To control Chrome from different workspaces:

**Option 1: Multiple native host scripts**
- Create different native host scripts pointing to different workspace IPs
- Switch the path in Chrome manifest

**Option 2: Environment variable**
- Modify native host to read workspace IP from environment
- Set different IPs per terminal session

**Option 3: CLI argument**
- Enhance native host to accept workspace IP as argument
- Update manifest to pass argument

## Changelog

### v3.2.6 (2026-01-17)
- Added MCP Reverse Proxy for remote Chrome control
- Separated socket paths to avoid conflicts:
  - Vibe Anywhere proxy: `/tmp/vibe-anywhere-chrome-proxy-{user}` (workspace → Mac)
  - Claude Code MCP: `/tmp/claude-mcp-browser-bridge-{user}` (Mac → workspace)
- Added downloadable native host script via dashboard

### v3.2.5 (2026-01-17)
- Fixed socket path conflicts
- Chrome extension now works with remote Claude Code

### Earlier versions
- Initial Chrome proxy implementation
- Forward proxy only (workspace → Mac Chrome CDP)

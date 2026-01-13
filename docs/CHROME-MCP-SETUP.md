# Chrome MCP Browser Control via Tailscale

This guide explains how to enable Claude Code CLI in remote Proxmox LXC containers to control Chrome browser on your local machine using Tailscale VPN and CDP (Chrome DevTools Protocol).

## Overview

Vibe Anywhere uses Tailscale to create a secure peer-to-peer VPN connection between:
- Your Proxmox server hosting the LXC containers
- Your local machine running Chrome browser

This allows Claude Code CLI running inside a workspace container to control your local Chrome browser transparently, enabling browser automation capabilities.

## Architecture

```
┌─────────────────────────────────────────┐
│  Local Machine                          │
│  ┌───────────────────────────────────┐  │
│  │ Chrome Browser                    │  │
│  │ --remote-debugging-port=9222      │  │
│  │ (CDP WebSocket: ws://localhost)   │  │
│  └───────────────────────────────────┘  │
│              ▲                          │
│              │ Tailscale VPN            │
│              │ (100.64.x.x)             │
└──────────────┼──────────────────────────┘
               │
┌──────────────┼──────────────────────────┐
│  Proxmox LXC Container                  │
│  ┌───────────┴───────────────────────┐  │
│  │ Claude Code CLI                   │  │
│  │  └─> /usr/local/bin/chromium      │  │
│  │       (CDP Proxy Shim)            │  │
│  │       - Auto-discovers local IP   │  │
│  │       - Proxies CDP over Tailscale│  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Prerequisites

- Proxmox VE server with Vibe Anywhere installed
- Tailscale account (free tier works)
- Local machine (Mac, Windows, or Linux)
- Chrome or Chromium browser

## Setup Instructions

### 1. Create Tailscale OAuth Client

Vibe Anywhere uses ephemeral auth keys (1-hour expiry, single-use) for security. This requires a Tailscale OAuth client.

1. Go to [Tailscale Admin Console → Settings → OAuth clients](https://login.tailscale.com/admin/settings/oauth)
2. Click **Generate OAuth client**
3. Set the following:
   - **Description**: Vibe Anywhere (or any name you prefer)
   - **Scopes**: Check `devices:write` (required for auth key generation)
4. Click **Generate client**
5. Copy the **Client Secret** (starts with `tskey-client-...`)

**Important**: Store this token securely. It will only be shown once.

### 2. Configure Vibe Anywhere Server

Add the Tailscale OAuth token to your Vibe Anywhere server's `.env` file:

```bash
# Edit .env file
nano /home/devops/vibe-anywhere/.env

# Add this line:
TAILSCALE_OAUTH_TOKEN=tskey-client-YOUR_TOKEN_HERE
```

Restart Vibe Anywhere:

```bash
npm run restart  # or your deployment method
```

**How it works**: When a workspace starts, Vibe Anywhere automatically:
1. Generates an ephemeral auth key via Tailscale API
2. Injects `TAILSCALE_AUTHKEY` environment variable into the container
3. The container authenticates with: `tailscale up --authkey=$TAILSCALE_AUTHKEY`

### 3. Install Tailscale on Local Machine

#### macOS
```bash
brew install tailscale
sudo tailscale up
```

#### Windows
Download and install from: https://tailscale.com/download/windows

#### Linux
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Verify installation:
```bash
tailscale status
```

You should see your machine listed with an IP in the `100.64.x.x` range.

### 4. Join Same Tailnet

**CRITICAL**: Your local machine must be on the **same Tailnet** as the Proxmox server.

1. Check your Proxmox server's tailnet: `tailscale status` (on Proxmox host)
2. Ensure your local machine joins the same tailnet
3. Verify connectivity: `ping <proxmox-tailscale-ip>` from your local machine

### 5. Install and Configure Chrome

#### Install Chrome/Chromium
- **macOS**: Download from [google.com/chrome](https://www.google.com/chrome/)
- **Windows**: Download from [google.com/chrome](https://www.google.com/chrome/)
- **Linux**: `sudo apt install chromium-browser` or `google-chrome-stable`

#### Install Claude Code Chrome Extension
1. Open Chrome and go to the [Claude Code extension page](https://chromewebstore.google.com/detail/claude-code-chrome/pblkcbbjbdmamikdbgiemkofkjhpjhpp)
2. Click **Add to Chrome**

**Official Documentation**: For detailed information about the Claude Code Chrome extension and browser control features, see the [official Claude Code Chrome documentation](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/chrome-extension)

#### Launch Chrome with Remote Debugging
Chrome must be launched with the `--remote-debugging-port=9222` flag to enable CDP:

**macOS**:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

**Windows** (PowerShell):
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

**Linux**:
```bash
google-chrome --remote-debugging-port=9222
# or
chromium-browser --remote-debugging-port=9222
```

**Tip**: Create an alias or startup script to avoid typing this every time.

### 6. Verify Connection

1. Start a Vibe Anywhere workspace
2. Check the workspace logs for:
   ```
   Generated ephemeral Tailscale auth key for workspace abc123 (expires: ...)
   ```
3. SSH into the container and verify Tailscale is connected:
   ```bash
   tailscale status
   ```
4. Test Chrome connection from container:
   ```bash
   curl http://<your-local-tailscale-ip>:9222/json/version
   ```
   Should return Chrome version info in JSON format.

### 7. Use Claude Code with Browser Control

Inside your workspace:
```bash
claude --chrome
```

Claude will automatically detect and use the CDP proxy shim to control your local Chrome browser.

## Visual Walkthrough

### Connection Status Indicators

The Vibe Anywhere dashboard shows real-time connection status for both Tailscale and Chrome:

**Tailscale Status**:
- ✅ **Green "Connected"**: Tailscale VPN is active and connected to your tailnet
- ❌ **Red "Disconnected"**: Tailscale is not connected (check container logs)
- ⚪ **Gray "Unknown"**: Status not yet determined (wait for first heartbeat)

**Chrome Status**:
- ✅ **Green with hostname/IP**: Chrome is connected and ready for browser control
  - Example: `macbook-pro (100.64.0.5:9222)`
- ⚪ **Gray "Waiting..."**: CDP proxy is searching for Chrome or Chrome is not running

### Step-by-Step Connection Flow

1. **Start Workspace**: Create or start a workspace with the `chrome-mcp-proxy` tech stack
2. **Wait for Tailscale**: Dashboard shows Tailscale status changing from "Unknown" → "Connected" (30 seconds)
3. **Launch Chrome Locally**: Start Chrome with `--remote-debugging-port=9222` on your local machine
4. **Start Claude CLI**: In workspace terminal, run `claude --chrome`
5. **Auto-Discovery**: CDP proxy automatically discovers your Chrome instance via Tailscale
6. **Dashboard Updates**: Chrome status shows green with your machine's hostname and IP
7. **Browser Control Active**: Claude can now interact with your local Chrome browser

### Troubleshooting with Dashboard

The dashboard provides real-time diagnostics:

| Dashboard Shows | What It Means | Next Steps |
|----------------|---------------|------------|
| Tailscale: Disconnected | Container can't reach Tailnet | Check `TAILSCALE_OAUTH_TOKEN` in .env, verify token has `devices:write` scope |
| Tailscale: Connected, Chrome: Waiting | Tailscale works, but Chrome not found | Start Chrome with `--remote-debugging-port=9222`, verify same Tailnet |
| Both Connected | Everything working | Ready to use `claude --chrome` for browser automation |

### Example Session

```bash
# Inside workspace terminal
$ claude --chrome
[CDP Shim] Discovering Chrome... Found 2 Tailscale peer(s)
[CDP Shim] Testing macbook-pro (100.64.0.5:9222)...
[CDP Shim] Connected to Chrome on macbook-pro (100.64.0.5:9222)

# Claude is now controlling your local Chrome browser
> Navigate to https://example.com and screenshot the page
✓ Navigated to https://example.com
✓ Screenshot saved to workspace
```

## Troubleshooting

### Chrome Not Found
**Symptom**: Claude CLI says "Chrome browser not found"

**Solutions**:
1. Verify Chrome is running with `--remote-debugging-port=9222`
2. Check Chrome is accessible from container:
   ```bash
   curl http://<your-local-tailscale-ip>:9222/json/version
   ```
3. Check Tailscale connection: `tailscale status`

### Tailscale Not Connected
**Symptom**: Container shows "Tailscale Disconnected"

**Solutions**:
1. Check `TAILSCALE_OAUTH_TOKEN` is set in `.env`
2. Verify token has `devices:write` scope
3. Check container logs: `journalctl -u tailscaled -n 50`
4. Manually authenticate: `sudo tailscale up --authkey=$TAILSCALE_AUTHKEY`

### DNS Resolution Issues (Proxmox + MagicDNS)
**Symptom**: Container can't resolve external domains (e.g., `ping google.com` fails)

**Cause**: When Tailscale is installed on the Proxmox host with MagicDNS enabled (the default), Proxmox automatically overrides LXC container DNS settings, breaking internet connectivity inside containers.

**How Vibe Anywhere Handles This**:
Vibe Anywhere **automatically protects DNS resolution** during container startup by:
1. Creating `/etc/.pve-ignore.resolv.conf` to prevent Proxmox DNS override
2. Configuring reliable DNS servers (Google DNS 8.8.8.8 + Cloudflare 1.1.1.1)
3. Making `/etc/resolv.conf` immutable to prevent accidental changes
4. Verifying DNS resolution works by testing `nslookup google.com`

You should see this in the container startup logs:
```
Protecting DNS resolution in container <vmid>
DNS resolution verified in container <vmid>
```

**Manual Verification**:
```bash
# Inside container
cat /etc/resolv.conf
# Should show:
# nameserver 8.8.8.8
# nameserver 1.1.1.1

# Test DNS resolution
ping -c 1 google.com
nslookup github.com
```

**If DNS Still Fails** (rare edge cases):

**Option 1**: Disable MagicDNS on Proxmox host (affects all LXC containers)
```bash
# On Proxmox host (requires Tailscale installed)
sudo tailscale set --accept-dns=false
```

**Option 2**: Manually reconfigure DNS in container
```bash
# Inside container
# Remove immutable flag if set
sudo chattr -i /etc/resolv.conf

# Reconfigure DNS
sudo touch /etc/.pve-ignore.resolv.conf
echo -e "nameserver 8.8.8.8\nnameserver 1.1.1.1" | sudo tee /etc/resolv.conf

# Make immutable again
sudo chattr +i /etc/resolv.conf
```

**Option 3**: Use different DNS servers
```bash
# Inside container
sudo chattr -i /etc/resolv.conf
echo -e "nameserver 1.1.1.1\nnameserver 9.9.9.9" | sudo tee /etc/resolv.conf
sudo chattr +i /etc/resolv.conf
```

**Why This Happens**:
- Proxmox uses `pct` (Proxmox Container Toolkit) to manage LXC containers
- By default, Proxmox syncs the host's `/etc/resolv.conf` to all LXC containers
- When Tailscale MagicDNS is enabled on the host, it configures `100.100.100.100` as the DNS server
- This MagicDNS server only resolves Tailnet devices, not external domains
- The `.pve-ignore.resolv.conf` file tells Proxmox to skip DNS sync for that container

### Connection Timeout
**Symptom**: CDP proxy times out when connecting to Chrome

**Solutions**:
1. Verify local machine is on the same Tailnet: `tailscale status`
2. Check firewall isn't blocking Tailscale (UDP port 41641)
3. Try pinging local machine from container: `ping <local-tailscale-ip>`

### Wrong Machine
**Symptom**: Claude connects to wrong Chrome instance (if you have multiple machines on the same Tailnet)

**Solution**: Set `TAILSCALE_CHROME_HOST` environment variable to specify which machine to use.

**Option 1 - Repository Level** (affects all workspaces for this repo):
1. Go to Repository Settings → Environment Variables
2. Add: `TAILSCALE_CHROME_HOST=macbook-pro.tail-abc123.ts.net`

**Option 2 - Workspace Level** (affects only this workspace):
1. Go to Workspace Settings → Environment Variables
2. Add: `TAILSCALE_CHROME_HOST=100.64.0.5`

You can use either a Tailscale hostname (`macbook-pro.tail-abc123.ts.net`) or IP address (`100.64.0.5`).

See [Multi-Machine Support](#multi-machine-support) section for more details.

## Security Considerations

### Ephemeral Auth Keys
- **1-hour expiry**: Keys expire after 1 hour, limiting exposure window
- **Single-use**: Each key can only be used once to authenticate a device
- **No long-lived credentials**: Containers never store permanent auth keys

### OAuth Token Security
- Store `TAILSCALE_OAUTH_TOKEN` securely (don't commit to Git)
- Rotate token periodically via Tailscale admin console
- Token only has `devices:write` scope (minimal required permissions)

### Network Isolation
- Tailscale uses WireGuard encryption for all traffic
- Peer-to-peer connections (no traffic through Tailscale servers)
- Only devices on your Tailnet can communicate

## Advanced Configuration

### Multi-Machine Support
If you work from multiple computers (e.g., desktop + laptop) on the same Tailnet, you can specify which machine's Chrome to use for each workspace/repository.

#### Setting TAILSCALE_CHROME_HOST

**Per Repository** (recommended for consistent browser preference):
1. Go to Repository Settings → Environment Variables
2. Add: `TAILSCALE_CHROME_HOST=macbook-pro.tail-abc123.ts.net`
3. All workspaces for this repository will use this Chrome instance

**Per Workspace** (for specific workspace overrides):
1. Go to Workspace Settings → Environment Variables
2. Add: `TAILSCALE_CHROME_HOST=macbook-pro.tail-abc123.ts.net`
3. Only this workspace will use the specified Chrome instance

#### Supported Formats

**Tailscale Hostname** (recommended):
```bash
TAILSCALE_CHROME_HOST=macbook-pro.tail-abc123.ts.net
```

**Tailscale IP Address**:
```bash
TAILSCALE_CHROME_HOST=100.64.0.5
```

**Hostname Pattern** (for flexible matching):
```bash
TAILSCALE_CHROME_HOST=macbook-pro
# Matches: macbook-pro.tail-abc123.ts.net
```

#### Discovery Priority Order

The CDP proxy shim uses this priority order when finding Chrome:

1. **Cached IP** (5-minute cache): If Chrome was recently discovered and is still responding
2. **TAILSCALE_CHROME_HOST env var**: If set, tries this hostname/IP first
3. **Auto-Discovery**: Scans all Tailscale peers until Chrome is found

If any step fails (hostname doesn't resolve, Chrome not running, connection timeout), it automatically falls back to the next method.

#### Hostname Validation

Before attempting connection, the CDP proxy:
- Resolves hostname to IP via `tailscale status --json`
- Tests Chrome connection with HTTP GET to `/json/version`
- Falls back to auto-discovery if validation fails
- Logs all discovery attempts to container stdout for debugging

### Custom Chrome Port
If you use a different debug port:

1. Launch Chrome with custom port: `chrome --remote-debugging-port=9223`
2. Set `CHROME_REMOTE_DEBUGGING_PORT=9223` in workspace environment variables

## Architecture Details

### CDP Proxy Shim
The CDP proxy shim (`/usr/local/bin/chromium`) is a fake binary that:
1. Accepts standard Chromium arguments (e.g., `--remote-debugging-port=9222`)
2. Discovers Chrome instance using priority order:
   - Checks cache (5-minute TTL) if Chrome was recently found
   - Uses `TAILSCALE_CHROME_HOST` env var if set (validates hostname/IP first)
   - Auto-discovers by trying all Tailscale peers via `tailscale status --json`
3. Validates connection with HTTP GET to `/json/version` before connecting
4. Connects to `ws://<tailscale-ip>:9222/devtools/browser` (CDP WebSocket)
5. Proxies all CDP protocol messages bidirectionally
6. Auto-reconnects with exponential backoff if connection lost
7. Returns exit code 0 if connection successful

### Tech Stack Installation
The `chrome-mcp-proxy` tech stack automatically installs:
- Tailscale VPN client
- CDP proxy shim binary (Node.js SEA, no Node.js dependency)
- Symlink: `/usr/local/bin/chromium` → CDP proxy shim

### Environment Variables
- `TAILSCALE_AUTHKEY`: Ephemeral auth key (auto-generated by Vibe Anywhere, 1-hour expiry)
- `CHROME_PATH`: Set to `/usr/local/bin/chromium` (auto-configured, points to CDP proxy shim)
- `TAILSCALE_CHROME_HOST`: Optional. Specifies which machine's Chrome to use (hostname or IP)
  - Supports Tailscale hostnames: `macbook-pro.tail-abc123.ts.net`
  - Supports Tailscale IPs: `100.64.0.5`
  - Supports hostname patterns: `macbook-pro` (matches first peer with prefix)
  - If not set, auto-discovers by trying all Tailscale peers
  - Can be set at repository or workspace level

## Additional Resources

### Claude Code Documentation
- [Claude Code Chrome Extension](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/chrome-extension) - Official guide to browser control features
- [Claude Code Overview](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) - Getting started with Claude Code CLI
- [Claude Code GitHub](https://github.com/anthropics/claude-code) - Source code and issue tracker

### Tailscale Documentation
- [Tailscale Quickstart](https://tailscale.com/kb/1017/install) - Installation guides for all platforms
- [Tailscale SSH](https://tailscale.com/kb/1193/tailscale-ssh) - Secure SSH access over Tailscale
- [OAuth Clients](https://tailscale.com/kb/1215/oauth-clients) - API authentication guide

### Support
For Vibe Anywhere-specific issues:
- Check the troubleshooting section above
- Review container logs for error messages
- Verify Tailscale and Chrome connection status in the dashboard

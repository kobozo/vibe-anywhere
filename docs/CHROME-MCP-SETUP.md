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

**Cause**: Tailscale MagicDNS on Proxmox host overrides LXC container DNS settings.

**Solution 1 (Recommended)**: Disable MagicDNS on Proxmox host
```bash
# On Proxmox host
sudo tailscale set --accept-dns=false
```

**Solution 2**: Prevent Proxmox from overriding DNS in containers
```bash
# Inside container
sudo touch /etc/.pve-ignore.resolv.conf
```

Then manually configure `/etc/resolv.conf`:
```bash
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf
```

### Connection Timeout
**Symptom**: CDP proxy times out when connecting to Chrome

**Solutions**:
1. Verify local machine is on the same Tailnet: `tailscale status`
2. Check firewall isn't blocking Tailscale (UDP port 41641)
3. Try pinging local machine from container: `ping <local-tailscale-ip>`

### Wrong Machine
**Symptom**: Claude connects to wrong Chrome instance (if you have multiple machines)

**Solution**: Set `TAILSCALE_CHROME_HOST` environment variable in repository settings:
```
TAILSCALE_CHROME_HOST=macbook-pro.tail-abc123.ts.net
```
or
```
TAILSCALE_CHROME_HOST=100.64.0.5
```

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
If you work from multiple computers, set `TAILSCALE_CHROME_HOST` per workspace:

1. Go to workspace settings
2. Add environment variable: `TAILSCALE_CHROME_HOST=macbook-pro.tail-abc123.ts.net`
3. CDP proxy will prioritize this over auto-discovery

### Custom Chrome Port
If you use a different debug port:

1. Launch Chrome with custom port: `chrome --remote-debugging-port=9223`
2. Set `CHROME_REMOTE_DEBUGGING_PORT=9223` in workspace environment variables

## Architecture Details

### CDP Proxy Shim
The CDP proxy shim (`/usr/local/bin/chromium`) is a fake binary that:
1. Accepts standard Chromium arguments (e.g., `--remote-debugging-port=9222`)
2. Auto-discovers local machine's Tailscale IP via `tailscale status --json`
3. Connects to `ws://<tailscale-ip>:9222/devtools/browser` (CDP WebSocket)
4. Proxies all CDP protocol messages bidirectionally
5. Returns exit code 0 if connection successful

### Tech Stack Installation
The `chrome-mcp-proxy` tech stack automatically installs:
- Tailscale VPN client
- CDP proxy shim binary (Node.js SEA, no Node.js dependency)
- Symlink: `/usr/local/bin/chromium` → CDP proxy shim

### Environment Variables
- `TAILSCALE_AUTHKEY`: Ephemeral auth key (auto-generated by Vibe Anywhere)
- `CHROME_PATH`: Set to `/usr/local/bin/chromium` (auto-configured)
- `TAILSCALE_CHROME_HOST`: Optional override for multi-machine setups

## Support

For issues or questions:
- GitHub Issues: [vibe-anywhere/issues](https://github.com/your-repo/issues)
- Tailscale Docs: [tailscale.com/kb](https://tailscale.com/kb/)
- Claude Code Docs: [docs.anthropic.com/claude-code](https://docs.anthropic.com/claude-code)

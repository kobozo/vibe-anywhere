# Proxmox LXC Template Setup Guide

This guide explains how to create a Proxmox LXC template for Vibe Anywhere workspaces with the binary agent.

## Prerequisites

- Proxmox VE server with LXC support
- Vibe Anywhere server running and accessible
- Base Debian 12 (Bookworm) LXC container

## Quick Start

### 1. Create Base Container

Create a new LXC container from Debian 12 template:

```bash
# On Proxmox host
pct create 150 \
  local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname vibe-anywhere-template \
  --memory 2048 \
  --swap 512 \
  --cores 2 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --storage local-lvm \
  --rootfs local-lvm:8 \
  --unprivileged 1 \
  --features nesting=1
```

### 2. Start and Access Container

```bash
pct start 150
pct enter 150
```

### 3. Install Base Packages

Inside the container:

```bash
# Update system
apt update && apt upgrade -y

# Install required packages
apt install -y \
  git \
  curl \
  wget \
  tmux \
  vim \
  sudo \
  ca-certificates

# Create kobozo user
useradd -m -s /bin/bash kobozo
echo "kobozo:VibeAnywhere2024!" | chpasswd

# Add kobozo to sudo with NOPASSWD (required for agent operations)
echo "kobozo ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/kobozo
chmod 440 /etc/sudoers.d/kobozo

# Create workspace directory
mkdir -p /workspace
chown kobozo:kobozo /workspace
```

### 4. Copy Template Preparation Script

From your Vibe Anywhere server:

```bash
# On Proxmox host
pct push 150 /path/to/vibe-anywhere/scripts/prepare-proxmox-template.sh /root/prepare-template.sh
pct exec 150 -- chmod +x /root/prepare-template.sh
```

### 5. Run Template Preparation Script

Inside the container (as root):

```bash
# Set the Vibe Anywhere server URL (adjust to your server)
export AGENT_URL="http://192.168.3.105:3000/api/workspaces/agent/bundle"

# Run preparation script
/root/prepare-template.sh
```

The script will:
- Download and install the Vibe Anywhere agent binary
- Install the systemd service (disabled)
- Create CLI symlink
- Clear workspace-specific configuration
- Clear logs and machine identifiers
- Verify everything is ready

### 6. Clean Up and Stop Container

```bash
# Remove the preparation script
rm /root/prepare-template.sh

# Exit container
exit

# On Proxmox host - stop container
pct stop 150
```

### 7. Convert to Template

```bash
# On Proxmox host
pct template 150
```

## What's Included in the Template

### Installed Software

- Debian 12 (Bookworm) base
- Git, curl, wget, tmux, vim
- Vibe Anywhere agent binary (`/opt/vibe-anywhere-agent/dist/vibe-anywhere-agent`)
- Vibe Anywhere CLI (`/usr/local/bin/vibe-anywhere`)

### User Configuration

- **User**: `kobozo`
- **Password**: `VibeAnywhere2024!`
- **Sudo**: NOPASSWD enabled (required for agent)
- **Home**: `/home/kobozo`
- **Workspace**: `/workspace` (owned by kobozo)

### Agent Configuration

- **Binary**: `/opt/vibe-anywhere-agent/dist/vibe-anywhere-agent` (standalone, no Node.js required)
- **CLI**: `/opt/vibe-anywhere-agent/cli/vibe-anywhere` (symlinked to `/usr/local/bin/vibe-anywhere`)
- **Service**: `/etc/systemd/system/vibe-anywhere-agent.service` (disabled in template)
- **Version**: 3.0.0

### Systemd Service

The agent service is **disabled** in the template. When Vibe Anywhere creates a workspace from this template, it will:

1. Start the container
2. Create `/etc/vibe-anywhere-agent.env` with workspace-specific environment variables:
   - `SESSION_HUB_URL` - Vibe Anywhere WebSocket URL
   - `WORKSPACE_ID` - Unique workspace identifier
   - `AGENT_TOKEN` - Authentication token
3. Enable and start the `vibe-anywhere-agent` service
4. Agent connects automatically

## Creating Workspaces from Template

Once the template is created, Vibe Anywhere will automatically:

1. Clone a new container from template 150
2. Set unique hostname
3. Start the container
4. Configure agent with workspace-specific settings
5. Enable and start agent service
6. Agent connects and registers

## Troubleshooting

### Agent Not Starting

Check the systemd service configuration:

```bash
pct exec <vmid> -- systemctl status vibe-anywhere-agent
pct exec <vmid> -- journalctl -u vibe-anywhere-agent -n 50
```

Verify the service is using the binary:

```bash
pct exec <vmid> -- grep ExecStart /etc/systemd/system/vibe-anywhere-agent.service
# Should show: ExecStart=/opt/vibe-anywhere-agent/dist/vibe-anywhere-agent
```

### Binary Not Found

Verify agent installation:

```bash
pct exec <vmid> -- ls -lh /opt/vibe-anywhere-agent/dist/vibe-anywhere-agent
pct exec <vmid> -- /opt/vibe-anywhere-agent/dist/vibe-anywhere-agent --version
```

### Environment Variables Missing

Check environment file:

```bash
pct exec <vmid> -- cat /etc/vibe-anywhere-agent.env
# Should contain: SESSION_HUB_URL, WORKSPACE_ID, AGENT_TOKEN
```

### Permissions Issues

Verify ownership:

```bash
pct exec <vmid> -- ls -ld /opt/vibe-anywhere-agent
pct exec <vmid> -- ls -ld /workspace
# Both should be owned by kobozo:kobozo
```

## Updating the Template

To update the template with a new agent version:

1. Clone the template to a new container:
   ```bash
   pct clone 150 151 --full
   ```

2. Start and enter the container:
   ```bash
   pct start 151
   pct enter 151
   ```

3. Update the agent:
   ```bash
   cd /opt/vibe-anywhere-agent
   wget -O agent-bundle.tar.gz http://your-server:3000/api/workspaces/agent/bundle
   tar -xzf agent-bundle.tar.gz
   rm agent-bundle.tar.gz
   chown -R kobozo:kobozo .
   chmod +x dist/vibe-anywhere-agent
   chmod +x cli/vibe-anywhere
   ```

4. Verify and clean up:
   ```bash
   /path/to/prepare-template.sh
   ```

5. Convert to template:
   ```bash
   pct stop 151
   pct template 151
   ```

6. Update Vibe Anywhere to use new template ID (151)

## Template Maintenance

### Regular Updates

Update the template periodically with:
- Security patches: `apt update && apt upgrade`
- New agent versions (follow update process above)
- System utilities as needed

### Version Tracking

Document template versions in Proxmox:

```bash
# Add notes to template
pct set 150 --description "Vibe Anywhere Template
- Debian 12 (Bookworm)
- Agent v3.0.0
- Created: 2026-01-09
- Last updated: 2026-01-09"
```

## Best Practices

1. **Always use the preparation script** before converting to template
2. **Test the template** by creating a test workspace before production use
3. **Keep multiple template versions** (150, 151, 152, etc.) for rollback capability
4. **Document changes** in template descriptions
5. **Update templates regularly** with security patches
6. **Verify agent version** matches server expectations

## Security Considerations

- The `kobozo` user has NOPASSWD sudo access (required for agent operations)
- This is safe because containers are isolated workspaces
- Each workspace has unique authentication tokens
- Agent uses WebSocket with authentication
- Change the default password if containers are exposed to networks

## Additional Resources

- Vibe Anywhere Documentation: `/CLAUDE.md`
- Agent Source: `/packages/agent/`
- Proxmox LXC Documentation: https://pve.proxmox.com/wiki/Linux_Container

#!/bin/bash
#
# Setup Proxmox LXC template for Session Hub Claude instances
#
# Usage: ./setup-proxmox-template.sh [VMID] [STORAGE]
#
# This script must be run on the Proxmox host with root access.
# It creates an LXC container with Claude CLI, Node.js, and development tools,
# then converts it to a template for cloning.
#

set -e

TEMPLATE_VMID=${1:-100}
STORAGE=${2:-local-lvm}
HOSTNAME="claude-template"
MEMORY=2048
CORES=2
DISK_SIZE=8
BRIDGE="vmbr0"
VLAN_TAG=${3:-}  # Optional VLAN tag

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Session Hub LXC Template Setup ===${NC}"
echo "VMID: $TEMPLATE_VMID"
echo "Storage: $STORAGE"
echo "Hostname: $HOSTNAME"
echo "Memory: ${MEMORY}MB"
echo "Cores: $CORES"
echo "Disk: ${DISK_SIZE}GB"
echo ""

# Check if running on Proxmox
if ! command -v pct &> /dev/null; then
    echo -e "${RED}Error: pct command not found. This script must be run on a Proxmox host.${NC}"
    exit 1
fi

# Check if template already exists
if pct status $TEMPLATE_VMID &> /dev/null; then
    echo -e "${YELLOW}Warning: VMID $TEMPLATE_VMID already exists.${NC}"
    read -p "Do you want to destroy it and create a new template? (y/N): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Aborting."
        exit 1
    fi
    echo "Destroying existing container..."
    pct stop $TEMPLATE_VMID 2>/dev/null || true
    pct destroy $TEMPLATE_VMID --force
fi

# Find Debian template
echo -e "${GREEN}Looking for Debian template...${NC}"
TEMPLATE=$(pveam list local | grep -E "debian-12.*amd64" | head -1 | awk '{print $1}')

if [ -z "$TEMPLATE" ]; then
    echo -e "${YELLOW}Debian 12 template not found. Downloading...${NC}"
    pveam update
    pveam download local debian-12-standard_12.2-1_amd64.tar.zst
    TEMPLATE="local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst"
fi

echo "Using template: $TEMPLATE"

# Build network config
NET_CONFIG="name=eth0,bridge=$BRIDGE,ip=dhcp"
if [ -n "$VLAN_TAG" ]; then
    NET_CONFIG="$NET_CONFIG,tag=$VLAN_TAG"
fi

# Create container
echo -e "${GREEN}Creating LXC container...${NC}"
pct create $TEMPLATE_VMID $TEMPLATE \
    --hostname $HOSTNAME \
    --memory $MEMORY \
    --cores $CORES \
    --rootfs ${STORAGE}:${DISK_SIZE} \
    --net0 "$NET_CONFIG" \
    --features nesting=1 \
    --unprivileged 1 \
    --start 0

echo -e "${GREEN}Starting container for configuration...${NC}"
pct start $TEMPLATE_VMID

# Wait for container to be ready
echo "Waiting for container to start..."
sleep 5

# Wait for network
echo "Waiting for network..."
for i in {1..30}; do
    if pct exec $TEMPLATE_VMID -- ping -c1 8.8.8.8 &>/dev/null; then
        break
    fi
    sleep 2
done

# Configure the container
echo -e "${GREEN}Installing packages...${NC}"
pct exec $TEMPLATE_VMID -- bash -c '
set -e

export DEBIAN_FRONTEND=noninteractive

echo "Updating package lists..."
apt-get update

echo "Installing base packages..."
apt-get install -y \
    curl \
    git \
    openssh-server \
    sudo \
    ca-certificates \
    gnupg \
    lsb-release \
    wget \
    build-essential

echo "Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

echo "Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code

echo "Claude version: $(claude --version)"

echo "Installing lazygit..."
LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep -Po "\"tag_name\": *\"v\K[^\"]*")
curl -Lo lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/download/v${LAZYGIT_VERSION}/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz"
tar xf lazygit.tar.gz lazygit
install lazygit -D -t /usr/local/bin/
rm lazygit.tar.gz lazygit

echo "lazygit version: $(lazygit --version)"

echo "Installing tmux for session persistence..."
apt-get install -y tmux

echo "Configuring tmux defaults..."
cat > /etc/tmux.conf << TMUXEOF
# Session Hub tmux configuration
# Disable mouse mode to allow browser text selection
set -g mouse off

# Better terminal colors
set -g default-terminal "xterm-256color"
set -ga terminal-overrides ",xterm-256color:Tc"

# Increase scrollback buffer
set -g history-limit 50000

# No delay for escape key
set -sg escape-time 0

# Start window numbering at 1
set -g base-index 1
setw -g pane-base-index 1
TMUXEOF
chmod 644 /etc/tmux.conf

echo "Setting up Session Hub agent directory..."
mkdir -p /opt/session-hub-agent
chown -R kobozo:kobozo /opt/session-hub-agent

echo "Creating Session Hub agent systemd service..."
cat > /etc/systemd/system/session-hub-agent.service << EOF
[Unit]
Description=Session Hub Sidecar Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=kobozo
Group=kobozo
WorkingDirectory=/opt/session-hub-agent
ExecStart=/usr/bin/node /opt/session-hub-agent/dist/index.js
Restart=always
RestartSec=5
EnvironmentFile=-/etc/session-hub-agent.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable session-hub-agent

echo "Session Hub agent service installed (will be configured at container start)"

echo "Configuring SSH..."
systemctl enable ssh
mkdir -p /root/.ssh
chmod 700 /root/.ssh

echo "Configuring git..."
git config --global init.defaultBranch main
git config --global user.email "claude@session-hub.local"
git config --global user.name "Claude Code"
git config --global --add safe.directory /workspace

echo "Creating workspace directory..."
mkdir -p /workspace
chmod 755 /workspace

echo "Creating Claude config directory..."
mkdir -p /root/.claude
chmod 700 /root/.claude

echo "Cleaning up..."
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "Configuration complete!"
'

echo -e "${GREEN}Stopping container...${NC}"
pct stop $TEMPLATE_VMID

# Wait for container to stop
sleep 3

echo -e "${GREEN}Converting to template...${NC}"
pct template $TEMPLATE_VMID

echo ""
echo -e "${GREEN}=== Template created successfully! ===${NC}"
echo ""
echo "Template VMID: $TEMPLATE_VMID"
echo ""
echo "To use this template with Session Hub, add to your .env file:"
echo ""
echo "  CONTAINER_BACKEND=proxmox"
echo "  PROXMOX_TEMPLATE_VMID=$TEMPLATE_VMID"
echo "  SESSION_HUB_URL=https://your-session-hub-server.com"
echo ""
echo "Agent Configuration:"
echo "  - The template includes a sidecar agent for terminal access"
echo "  - Agent will be configured automatically when containers are cloned"
echo "  - Agent connects to Session Hub via WebSocket (outbound)"
echo "  - tmux provides session persistence"
echo ""
echo "Agent will be installed on first container start."
echo ""

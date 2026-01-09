#!/bin/bash
set -e

# Vibe Anywhere - Proxmox LXC Template Preparation Script
# This script prepares a Proxmox LXC container to be converted into a template
# Run this script INSIDE the container before converting to template

echo "=========================================="
echo "Vibe Anywhere Template Preparation"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Error: This script must be run as root"
  exit 1
fi

# Check if running inside a container
if [ ! -f /etc/pve/.version ] && [ -f /.dockerenv -o -d /run/systemd/container ]; then
  echo "✓ Running inside container"
else
  echo "Warning: This script should be run inside the container, not on the Proxmox host"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Step 1: Install Vibe Anywhere Agent
echo ""
echo "[1/8] Installing Vibe Anywhere Agent..."
echo "----------------------------------------"

AGENT_DIR="/opt/vibe-anywhere-agent"
AGENT_URL="${AGENT_URL:-http://192.168.3.105:3000/api/workspaces/agent/bundle}"

# Create agent directory
mkdir -p "$AGENT_DIR"
cd "$AGENT_DIR"

# Download agent bundle
echo "Downloading agent bundle from: $AGENT_URL"
if command -v wget &> /dev/null; then
  wget -O agent-bundle.tar.gz "$AGENT_URL" || {
    echo "Error: Failed to download agent bundle"
    echo "Make sure the Vibe Anywhere server is running and accessible"
    exit 1
  }
elif command -v curl &> /dev/null; then
  curl -fsSL -o agent-bundle.tar.gz "$AGENT_URL" || {
    echo "Error: Failed to download agent bundle"
    echo "Make sure the Vibe Anywhere server is running and accessible"
    exit 1
  }
else
  echo "Error: Neither wget nor curl is available"
  exit 1
fi

# Extract bundle
echo "Extracting agent bundle..."
tar -xzf agent-bundle.tar.gz
rm agent-bundle.tar.gz

# Set permissions
chown -R kobozo:kobozo "$AGENT_DIR"
chmod +x vibe-anywhere-agent
chmod +x vibe-anywhere

echo "✓ Agent installed to $AGENT_DIR"
ls -lh vibe-anywhere-agent
echo ""

# Step 2: Install systemd service
echo "[2/8] Installing systemd service..."
echo "----------------------------------------"

cat > /etc/systemd/system/vibe-anywhere-agent.service << 'EOF'
[Unit]
Description=Vibe Anywhere Agent
Documentation=https://github.com/kobozo/vibe-anywhere
After=network.target

[Service]
Type=simple
User=kobozo
Group=kobozo
WorkingDirectory=/opt/vibe-anywhere-agent
ExecStart=/opt/vibe-anywhere-agent/vibe-anywhere-agent
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
EnvironmentFile=-/etc/vibe-anywhere-agent.env

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
systemctl daemon-reload

# DISABLE the service (will be enabled when workspace is created)
systemctl disable vibe-anywhere-agent

echo "✓ Systemd service installed (disabled)"
echo ""

# Step 3: Create CLI symlink
echo "[3/8] Creating CLI symlink..."
echo "----------------------------------------"

ln -sf /opt/vibe-anywhere-agent/vibe-anywhere /usr/local/bin/vibe-anywhere
echo "✓ CLI symlinked to /usr/local/bin/vibe-anywhere"
echo ""

# Step 4: Clear environment configuration
echo "[4/8] Clearing workspace-specific configuration..."
echo "----------------------------------------"

# Remove environment file (will be created by workspace)
rm -f /etc/vibe-anywhere-agent.env

# Remove any existing state
rm -f /home/kobozo/.session-hub-env-state.json
rm -f /etc/profile.d/vibe-anywhere-env.sh

echo "✓ Environment configuration cleared"
echo ""

# Step 5: Clear SSH keys and workspace data
echo "[5/8] Clearing workspace-specific data..."
echo "----------------------------------------"

# Clear workspace directory
rm -rf /workspace/*
rm -rf /workspace/.??*

# Reset workspace permissions
chown -R kobozo:kobozo /workspace

# Clear tmux sessions
su - kobozo -c "tmux kill-server" 2>/dev/null || true

echo "✓ Workspace data cleared"
echo ""

# Step 6: Clear logs
echo "[6/8] Clearing logs..."
echo "----------------------------------------"

# Clear agent logs
journalctl --vacuum-time=1s --quiet

# Clear other logs
rm -rf /var/log/vibe-anywhere-agent* 2>/dev/null || true

echo "✓ Logs cleared"
echo ""

# Step 7: Clear machine ID and SSH keys
echo "[7/8] Clearing machine-specific identifiers..."
echo "----------------------------------------"

# Clear machine ID (will be regenerated on first boot)
rm -f /etc/machine-id
rm -f /var/lib/dbus/machine-id

# Clear SSH host keys (will be regenerated on first boot)
rm -f /etc/ssh/ssh_host_*

# Clear bash history for kobozo user
su - kobozo -c "history -c" 2>/dev/null || true
rm -f /home/kobozo/.bash_history

# Clear root bash history
history -c
rm -f /root/.bash_history

echo "✓ Machine identifiers cleared"
echo ""

# Step 8: Verification
echo "[8/8] Verification..."
echo "----------------------------------------"

ERRORS=0

# Check agent binary exists
if [ ! -f "/opt/vibe-anywhere-agent/vibe-anywhere-agent" ]; then
  echo "✗ Agent binary not found"
  ERRORS=$((ERRORS+1))
else
  echo "✓ Agent binary exists"
fi

# Check CLI exists
if [ ! -f "/opt/vibe-anywhere-agent/vibe-anywhere" ]; then
  echo "✗ CLI binary not found"
  ERRORS=$((ERRORS+1))
else
  echo "✓ CLI binary exists"
fi

# Check systemd service exists
if [ ! -f "/etc/systemd/system/vibe-anywhere-agent.service" ]; then
  echo "✗ Systemd service not found"
  ERRORS=$((ERRORS+1))
else
  echo "✓ Systemd service exists"
fi

# Check service is disabled
if systemctl is-enabled vibe-anywhere-agent &>/dev/null; then
  echo "✗ Service should be disabled for template"
  ERRORS=$((ERRORS+1))
else
  echo "✓ Service is disabled"
fi

# Check workspace directory is empty
if [ "$(ls -A /workspace 2>/dev/null)" ]; then
  echo "✗ Workspace directory is not empty"
  ERRORS=$((ERRORS+1))
else
  echo "✓ Workspace directory is empty"
fi

# Check no environment file exists
if [ -f "/etc/vibe-anywhere-agent.env" ]; then
  echo "✗ Environment file should not exist in template"
  ERRORS=$((ERRORS+1))
else
  echo "✓ No environment file"
fi

echo ""

if [ $ERRORS -eq 0 ]; then
  echo "=========================================="
  echo "✓ Template preparation complete!"
  echo "=========================================="
  echo ""
  echo "This container is now ready to be converted to a template."
  echo ""
  echo "Next steps:"
  echo "1. Stop this container"
  echo "2. Convert it to a template in Proxmox"
  echo "3. New workspaces created from this template will automatically"
  echo "   download and configure the agent with workspace-specific settings"
  echo ""
  exit 0
else
  echo "=========================================="
  echo "✗ Template preparation failed with $ERRORS error(s)"
  echo "=========================================="
  echo ""
  echo "Please fix the errors above and run this script again."
  echo ""
  exit 1
fi

/**
 * Tech Stack Definitions
 *
 * Defines available tech stacks that can be pre-installed in templates
 * or installed per-workspace based on repository configuration.
 */

export type TechStackCategory = 'runtime' | 'ai-assistant' | 'network';

export interface TechStack {
  id: string;
  name: string;
  description: string;
  installScript: string;
  verifyCommand: string;
  requiresNesting?: boolean; // For Docker - requires LXC nesting feature
  dependencies?: string[]; // Other tech stacks that must be installed first
  category: TechStackCategory; // Category for UI grouping
}

export const TECH_STACKS: TechStack[] = [
  // ===================
  // Network / VPN
  // ===================
  {
    id: 'tailscale-vpn',
    name: 'Tailscale VPN',
    description: 'Secure mesh VPN for peer-to-peer connectivity',
    category: 'network',
    installScript: `
# Install Tailscale VPN
curl -fsSL https://tailscale.com/install.sh | sh

# Enable and start tailscaled daemon
systemctl enable tailscaled
systemctl start tailscaled

# Set kobozo user as Tailscale operator (allows non-root Tailscale commands)
sudo tailscale set --operator=kobozo

# Authenticate with Tailscale using ephemeral auth key from environment variable
# Note: TAILSCALE_AUTHKEY is injected by Vibe Anywhere during container startup
if [ -n "$TAILSCALE_AUTHKEY" ]; then
  tailscale up --authkey="$TAILSCALE_AUTHKEY" --accept-routes --accept-dns=false
  echo "Tailscale authenticated successfully"
  tailscale status
else
  echo "Warning: TAILSCALE_AUTHKEY not set. Run 'tailscale up --authkey=<key>' manually."
fi

# Verify Tailscale is running and connected
tailscale status || echo "Tailscale installed but not authenticated yet"
`.trim(),
    verifyCommand: 'tailscale version',
  },

  // ===================
  // Runtime / Dev Tools
  // ===================
  {
    id: 'nodejs',
    name: 'Node.js 22',
    description: 'Node.js 22.x LTS with npm',
    category: 'runtime',
    installScript: `
# Install Node.js 22 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
# Verify installation
node --version
npm --version
`.trim(),
    verifyCommand: 'node --version',
  },
  {
    id: 'python',
    name: 'Python 3.x',
    description: 'Python 3 with pip and venv',
    category: 'runtime',
    installScript: `
# Install Python 3 with pip and venv
apt-get update
apt-get install -y python3 python3-pip python3-venv python3-dev
# Create symlinks for convenience
update-alternatives --install /usr/bin/python python /usr/bin/python3 1 || true
# Verify installation
python3 --version
pip3 --version
`.trim(),
    verifyCommand: 'python3 --version',
  },
  {
    id: 'go',
    name: 'Go',
    description: 'Go programming language (latest stable)',
    category: 'runtime',
    installScript: `
# Install Go from official source
GO_VERSION=$(curl -s https://go.dev/VERSION?m=text | head -1)
curl -fsSL "https://go.dev/dl/\${GO_VERSION}.linux-amd64.tar.gz" -o /tmp/go.tar.gz
rm -rf /usr/local/go
tar -C /usr/local -xzf /tmp/go.tar.gz
rm /tmp/go.tar.gz
# Add to system-wide PATH
echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh
echo 'export PATH=$PATH:/usr/local/go/bin' >> /home/kobozo/.bashrc
# Verify installation
/usr/local/go/bin/go version
`.trim(),
    verifyCommand: '/usr/local/go/bin/go version || go version',
  },
  {
    id: 'rust',
    name: 'Rust',
    description: 'Rust programming language via rustup',
    category: 'runtime',
    installScript: `
# Install Rust via rustup for kobozo user
su - kobozo -c 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y'
# Also install system-wide for root
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
# Verify installation
su - kobozo -c 'source ~/.cargo/env && rustc --version'
`.trim(),
    verifyCommand: 'su - kobozo -c "source ~/.cargo/env && rustc --version"',
  },
  {
    id: 'docker',
    name: 'Docker',
    description: 'Docker Engine (requires LXC nesting)',
    category: 'runtime',
    requiresNesting: true,
    installScript: `
# Install Docker via official script
curl -fsSL https://get.docker.com | sh
# Add kobozo to docker group
usermod -aG docker kobozo
# Enable and start Docker
systemctl enable docker
systemctl start docker
# Verify installation
docker --version
`.trim(),
    verifyCommand: 'docker --version',
  },

  // ===================
  // AI Coding Assistants
  // ===================
  {
    id: 'chrome-mcp-proxy',
    name: 'Chrome MCP Proxy',
    description: 'Chrome DevTools Protocol proxy over Tailscale for remote browser control',
    category: 'ai-assistant',
    dependencies: ['nodejs', 'tailscale-vpn'],
    installScript: `
# Install Chrome MCP Proxy (CDP shim)
# This allows AI assistants to control Chrome browser on your local machine via Tailscale

# Note: VIBE_ANYWHERE_SERVER_URL is injected by Vibe Anywhere during container startup
if [ -z "$VIBE_ANYWHERE_SERVER_URL" ]; then
  echo "Error: VIBE_ANYWHERE_SERVER_URL not set. Cannot download CDP shim bundle."
  exit 1
fi

# Download CDP shim bundle from Vibe Anywhere server
echo "Downloading CDP shim bundle from $VIBE_ANYWHERE_SERVER_URL/api/cdp-shim/bundle..."
curl -fsSL "$VIBE_ANYWHERE_SERVER_URL/api/cdp-shim/bundle" -o /tmp/cdp-shim.tar.gz

# Create installation directory
mkdir -p /opt/vibe-anywhere-cdp-shim

# Extract bundle to installation directory
echo "Extracting CDP shim to /opt/vibe-anywhere-cdp-shim..."
tar -xzf /tmp/cdp-shim.tar.gz -C /opt/vibe-anywhere-cdp-shim
rm /tmp/cdp-shim.tar.gz

# Set execute permissions on the binary
chmod +x /opt/vibe-anywhere-cdp-shim/cdp-shim

# Create symlink to /usr/local/bin/chromium (so it acts like real chromium)
ln -sf /opt/vibe-anywhere-cdp-shim/cdp-shim /usr/local/bin/chromium

# Verify installation
chromium --version
echo "Chrome MCP Proxy installed successfully!"
`.trim(),
    verifyCommand: 'chromium --version',
  },
  {
    id: 'claude',
    name: 'Claude Code',
    description: 'Anthropic AI coding assistant',
    category: 'ai-assistant',
    dependencies: ['nodejs'],
    installScript: `
# Install Claude Code CLI for kobozo user (not globally as root)
# Configure npm to use local global directory
su - kobozo -c "mkdir -p ~/.npm-global"
su - kobozo -c "npm config set prefix ~/.npm-global"
su - kobozo -c "grep -q 'npm-global' ~/.bashrc || echo 'export PATH=~/.npm-global/bin:\$PATH' >> ~/.bashrc"
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && npm install -g @anthropic-ai/claude-code"
# Verify installation
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && claude --version" || echo "Claude CLI installed (version check may require auth)"
`.trim(),
    verifyCommand: 'su - kobozo -c "export PATH=~/.npm-global/bin:\\$PATH && which claude"',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    description: 'Google AI assistant (free tier available)',
    category: 'ai-assistant',
    dependencies: ['nodejs'],
    installScript: `
# Install Gemini CLI for kobozo user
su - kobozo -c "mkdir -p ~/.npm-global"
su - kobozo -c "npm config set prefix ~/.npm-global"
su - kobozo -c "grep -q 'npm-global' ~/.bashrc || echo 'export PATH=~/.npm-global/bin:\$PATH' >> ~/.bashrc"
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && npm install -g @google/gemini-cli"
# Verify installation
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && gemini --version" || echo "Gemini CLI installed"
`.trim(),
    verifyCommand: 'su - kobozo -c "export PATH=~/.npm-global/bin:\\$PATH && which gemini"',
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    description: 'OpenAI coding assistant',
    category: 'ai-assistant',
    dependencies: ['nodejs'],
    installScript: `
# Install OpenAI Codex CLI for kobozo user
su - kobozo -c "mkdir -p ~/.npm-global"
su - kobozo -c "npm config set prefix ~/.npm-global"
su - kobozo -c "grep -q 'npm-global' ~/.bashrc || echo 'export PATH=~/.npm-global/bin:\$PATH' >> ~/.bashrc"
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && npm install -g @openai/codex"
# Verify installation
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && codex --version" || echo "Codex CLI installed"
`.trim(),
    verifyCommand: 'su - kobozo -c "export PATH=~/.npm-global/bin:\\$PATH && which codex"',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    description: 'GitHub AI pair programmer (requires subscription)',
    category: 'ai-assistant',
    dependencies: ['nodejs'],
    installScript: `
# Install GitHub Copilot CLI for kobozo user
su - kobozo -c "mkdir -p ~/.npm-global"
su - kobozo -c "npm config set prefix ~/.npm-global"
su - kobozo -c "grep -q 'npm-global' ~/.bashrc || echo 'export PATH=~/.npm-global/bin:\$PATH' >> ~/.bashrc"
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && npm install -g @githubnext/github-copilot-cli"
# Verify installation
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && github-copilot-cli --version" || echo "Copilot CLI installed"
`.trim(),
    verifyCommand: 'su - kobozo -c "export PATH=~/.npm-global/bin:\\$PATH && which github-copilot-cli"',
  },
  {
    id: 'mistral',
    name: 'Mistral Vibe',
    description: 'Mistral AI coding agent (Devstral)',
    category: 'ai-assistant',
    dependencies: ['nodejs'],
    installScript: `
# Install Mistral Vibe CLI for kobozo user
su - kobozo -c "mkdir -p ~/.npm-global"
su - kobozo -c "npm config set prefix ~/.npm-global"
su - kobozo -c "grep -q 'npm-global' ~/.bashrc || echo 'export PATH=~/.npm-global/bin:\$PATH' >> ~/.bashrc"
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && npm install -g @mistralai/mistral-vibe" || {
  # Fallback to binary install if npm package not available
  su - kobozo -c "curl -fsSL https://raw.githubusercontent.com/mistralai/mistral-vibe/main/install.sh | bash"
}
# Verify installation
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && mistral-vibe --version" || echo "Mistral Vibe installed"
`.trim(),
    verifyCommand: 'su - kobozo -c "export PATH=~/.npm-global/bin:\\$PATH && which mistral-vibe"',
  },
  {
    id: 'cody',
    name: 'Cody (Sourcegraph)',
    description: 'Sourcegraph AI code assistant',
    category: 'ai-assistant',
    dependencies: ['nodejs'],
    installScript: `
# Install Cody CLI for kobozo user
su - kobozo -c "mkdir -p ~/.npm-global"
su - kobozo -c "npm config set prefix ~/.npm-global"
su - kobozo -c "grep -q 'npm-global' ~/.bashrc || echo 'export PATH=~/.npm-global/bin:\$PATH' >> ~/.bashrc"
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && npm install -g @sourcegraph/cody"
# Verify installation
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && cody --version" || echo "Cody CLI installed"
`.trim(),
    verifyCommand: 'su - kobozo -c "export PATH=~/.npm-global/bin:\\$PATH && which cody"',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'Open-source AI coding agent',
    category: 'ai-assistant',
    dependencies: ['nodejs'],
    installScript: `
# Install OpenCode CLI for kobozo user
su - kobozo -c "mkdir -p ~/.npm-global"
su - kobozo -c "npm config set prefix ~/.npm-global"
su - kobozo -c "grep -q 'npm-global' ~/.bashrc || echo 'export PATH=~/.npm-global/bin:\$PATH' >> ~/.bashrc"
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && npm install -g opencode-ai"
# Verify installation
su - kobozo -c "export PATH=~/.npm-global/bin:\$PATH && opencode --version" || echo "OpenCode installed"
`.trim(),
    verifyCommand: 'su - kobozo -c "export PATH=~/.npm-global/bin:\\$PATH && which opencode"',
  },
];

/**
 * Get tech stack by ID
 */
export function getTechStack(id: string): TechStack | undefined {
  return TECH_STACKS.find(stack => stack.id === id);
}

/**
 * Get multiple tech stacks by IDs, resolving dependencies and returning in install order
 */
export function getTechStacks(ids: string[]): TechStack[] {
  const result: TechStack[] = [];
  const added = new Set<string>();

  function addWithDependencies(id: string) {
    if (added.has(id)) return;
    const stack = getTechStack(id);
    if (!stack) return;

    // Add dependencies first
    if (stack.dependencies) {
      for (const depId of stack.dependencies) {
        addWithDependencies(depId);
      }
    }

    added.add(id);
    result.push(stack);
  }

  for (const id of ids) {
    addWithDependencies(id);
  }

  return result;
}

/**
 * Check if any of the given tech stacks (including dependencies) require LXC nesting
 */
export function requiresNesting(ids: string[]): boolean {
  // Get all stacks including dependencies
  const stacks = getTechStacks(ids);
  return stacks.some(stack => stack.requiresNesting === true);
}

/**
 * Generate combined install script for multiple tech stacks
 */
export function generateInstallScript(ids: string[]): string {
  const stacks = getTechStacks(ids);
  if (stacks.length === 0) return '';

  const scripts = stacks.map(stack => `
# ============================================
# Installing: ${stack.name}
# ============================================
${stack.installScript}
`);

  return `#!/bin/bash
set -e

echo "Installing tech stacks: ${stacks.map(s => s.name).join(', ')}"

${scripts.join('\n')}

echo "Tech stack installation complete!"
`;
}

/**
 * Generate verification script to check which stacks are installed
 */
export function generateVerifyScript(ids: string[]): string {
  const stacks = getTechStacks(ids);
  if (stacks.length === 0) return 'echo "No stacks to verify"';

  const checks = stacks.map(stack => `
# Check ${stack.name}
if ${stack.verifyCommand} > /dev/null 2>&1; then
  echo "${stack.id}:installed"
else
  echo "${stack.id}:missing"
fi
`);

  return `#!/bin/bash
${checks.join('\n')}
`;
}

/**
 * Get all tech stacks by category
 */
export function getStacksByCategory(category: TechStackCategory): TechStack[] {
  return TECH_STACKS.filter(stack => stack.category === category);
}

/**
 * Get all tech stacks that depend on a given stack ID
 * Used to determine if a stack can be removed (i.e., nothing depends on it)
 */
export function getStacksDependingOn(stackId: string): TechStack[] {
  return TECH_STACKS.filter(stack =>
    stack.dependencies?.includes(stackId)
  );
}

/**
 * Get the names of selected stacks that depend on a given stack ID
 * Used for tooltip display
 */
export function getSelectedDependentNames(stackId: string, selectedIds: string[]): string[] {
  return TECH_STACKS
    .filter(stack =>
      stack.dependencies?.includes(stackId) &&
      selectedIds.includes(stack.id)
    )
    .map(stack => stack.name);
}

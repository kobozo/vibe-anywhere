/**
 * Tech Stack Definitions
 *
 * Defines available tech stacks that can be pre-installed in templates
 * or installed per-workspace based on repository configuration.
 */

export interface TechStack {
  id: string;
  name: string;
  description: string;
  installScript: string;
  verifyCommand: string;
  requiresNesting?: boolean; // For Docker - requires LXC nesting feature
}

export const TECH_STACKS: TechStack[] = [
  {
    id: 'nodejs',
    name: 'Node.js 22',
    description: 'Node.js 22.x LTS with npm',
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
];

/**
 * Get tech stack by ID
 */
export function getTechStack(id: string): TechStack | undefined {
  return TECH_STACKS.find(stack => stack.id === id);
}

/**
 * Get multiple tech stacks by IDs
 */
export function getTechStacks(ids: string[]): TechStack[] {
  return ids.map(id => getTechStack(id)).filter((s): s is TechStack => s !== undefined);
}

/**
 * Check if any of the given tech stacks require LXC nesting
 */
export function requiresNesting(ids: string[]): boolean {
  return ids.some(id => {
    const stack = getTechStack(id);
    return stack?.requiresNesting === true;
  });
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

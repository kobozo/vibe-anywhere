# Claude Code CLI Instance Container
# This Dockerfile creates an isolated environment for running Claude Code
# with lazygit, lazydocker, and other development tools

FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    bash \
    openssh-client \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (for lazydocker to communicate with host docker)
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Install lazygit
RUN LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep -Po '"tag_name": *"v\K[^"]*') \
    && curl -Lo lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/download/v${LAZYGIT_VERSION}/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz" \
    && tar xf lazygit.tar.gz lazygit \
    && install lazygit -D -t /usr/local/bin/ \
    && rm lazygit.tar.gz lazygit

# Install lazydocker
RUN curl -Lo lazydocker.tar.gz "https://github.com/jesseduffield/lazydocker/releases/latest/download/lazydocker_$(curl -s https://api.github.com/repos/jesseduffield/lazydocker/releases/latest | grep -Po '"tag_name": *"v\K[^"]*')_Linux_x86_64.tar.gz" \
    && tar xf lazydocker.tar.gz lazydocker \
    && install lazydocker -D -t /usr/local/bin/ \
    && rm lazydocker.tar.gz lazydocker

# Configure git
RUN git config --global init.defaultBranch main \
    && git config --global user.email "claude@session-hub.local" \
    && git config --global user.name "Claude Code"

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create workspace directory
WORKDIR /workspace

# The node:22-bookworm image has a 'node' user with UID 1000
# We'll use this user since it matches the common host user UID
# Add docker group for socket access
RUN groupadd -g 999 docker || true \
    && usermod -aG docker node \
    && chown -R node:node /workspace \
    && mkdir -p /home/node/.claude \
    && chown -R node:node /home/node/.claude

# Switch to non-root user (node user has UID 1000)
USER node

# Set environment for Claude CLI
ENV HOME=/home/node
ENV TERM=xterm-256color
ENV COLORTERM=truecolor

# Default command - start bash (commands will be exec'd by the host)
CMD ["bash"]

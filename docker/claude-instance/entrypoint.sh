#!/bin/bash
# Entrypoint script for Claude Code instance container

set -e

# Ensure git is configured in the workspace
if [ -d "/workspace/.git" ]; then
    cd /workspace
    # Set safe directory for git
    git config --global --add safe.directory /workspace
fi

# Start Claude Code CLI
# Using --dangerously-skip-update-check to avoid prompts
exec claude --dangerously-skip-update-check "$@"

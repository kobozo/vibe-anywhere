---
name: git-ops
description: Auto-triggers when working on Git operations, SSH key management, encryption, git identities, branch caching, repository configuration, or git hooks. Keywords git, SSH, key, encryption, identity, branch, repository, clone, hook, ls-remote.
context: fork
agent: git-repository
---

# Git Operations Skill

This skill automatically triggers the git-repository agent when you work on Git-related features.

## When This Triggers

- SSH key encryption/decryption
- Git identity management
- Branch caching and refresh
- Repository cloning configuration
- Git hooks management
- SSH key generation
- Remote git operations

## Quick Start

The git-repository agent has comprehensive knowledge of:
- AES-256-GCM encryption for SSH keys
- Git identity configurations
- Branch caching via ls-remote
- Git hooks (base64 encoding)
- Shallow clones
- SSH key fingerprinting

## Reference Files

- `PATTERNS.md` - Encryption and git patterns
- `EXAMPLES.md` - Real code examples
- `TROUBLESHOOTING.md` - Common issues
- `SSH-KEYS-GUIDE.md` - SSH key encryption guide

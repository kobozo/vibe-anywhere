---
name: Bug Report
about: Report a bug or unexpected behavior
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description

A clear and concise description of what the bug is.

## Steps to Reproduce

1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected Behavior

A clear description of what you expected to happen.

## Actual Behavior

What actually happened instead.

## Screenshots

If applicable, add screenshots to help explain your problem.

## Environment

- **OS**: [e.g., Debian 12, Ubuntu 22.04]
- **Node.js Version**: [e.g., 22.5.0]
- **PostgreSQL Version**: [e.g., 16.1]
- **Container Backend**: [Docker or Proxmox]
- **Browser**: [e.g., Chrome 120, Firefox 121]
- **Vibe Anywhere Version**: [e.g., 1.0.0 or commit hash]

## Installation Method

- [ ] One-line installer script
- [ ] Manual installation
- [ ] Development setup

## Container Backend Details

**If using Docker:**
- Docker Version: [e.g., 24.0.7]

**If using Proxmox:**
- Proxmox VE Version: [e.g., 8.1]
- Node: [e.g., pve]
- Storage Type: [e.g., local-zfs]
- Template ID: [e.g., 150]

## Logs

<details>
<summary>Server Logs</summary>

```
Paste relevant logs here. For systemd service:
sudo journalctl -u vibe-anywhere --since "1 hour ago"

For development:
npm run dev output
```

</details>

<details>
<summary>Browser Console</summary>

```
Paste any browser console errors here (F12 → Console tab)
```

</details>

## Additional Context

Add any other context about the problem here.

## Possible Solution

If you have ideas on how to fix this, share them here (optional).

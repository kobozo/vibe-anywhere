---
name: workspace-dev
description: Auto-triggers when working on workspace creation, container provisioning, template selection, Proxmox LXC operations, startup orchestration, resource allocation, network configuration, or agent provisioning. Keywords workspace, container, provisioning, template, Proxmox, LXC, startup, resource, allocation, VMID, clone, IP address, DHCP, static IP, agent provision.
context: fork
agent: workspace-lifecycle
---

# Workspace Development Skill

This skill automatically triggers the workspace-lifecycle agent when you work on workspace-related features.

## When This Triggers

- Creating or starting workspaces
- Container cloning and provisioning
- Template selection and inheritance
- Proxmox LXC operations
- Resource allocation (memory, CPU, disk)
- Network configuration (static IP, DHCP, VLANs)
- Agent provisioning and startup
- Git repository cloning in containers

## Quick Start

The workspace-lifecycle agent has comprehensive knowledge of:
- Workspace creation workflow
- Container lifecycle management
- Template inheritance chains
- Startup progress broadcasting
- Network and DNS configuration
- Agent provisioning
- Common issues and solutions

## Reference Files

- `PATTERNS.md` - Common code patterns
- `EXAMPLES.md` - Real examples from codebase
- `TROUBLESHOOTING.md` - Common issues and fixes
- `PROVISIONING-GUIDE.md` - Step-by-step provisioning workflow

# Workspace Provisioning Guide

## Step 1: Create Workspace Record
Database record with name, branch, template reference

## Step 2: Start Container
- Determine VMID (forced > reused > auto-allocate)
- Clone from template
- Configure resources and network
- Start container
- Wait for IP address

## Step 3: Clone Repository
- Check if already cloned
- Get SSH key if private repo
- Clone via SSH to /workspace
- Install missing tech stacks

## Step 4: Inject Environment
- Merge repo + template env vars
- Generate Tailscale auth key
- Write to /etc/profile.d/vibe-anywhere-env.sh

## Step 5: Provision Agent
- Stop existing service
- Write agent config
- Download and extract bundle
- Start service
- Wait for connection

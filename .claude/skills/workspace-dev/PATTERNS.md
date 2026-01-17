# Workspace Development Patterns

## Container Creation
```typescript
// Clone from template
const upid = await client.cloneLxc(templateVmid, newVmid, { full: true });
await pollTaskUntilComplete(client, upid);

// Configure resources
await client.setLxcConfig(newVmid, {
  memory: memMb,
  cores: cpuCores,
  net0: `name=eth0,bridge=vmbr0,ip=${staticIp},gw=${gateway}`,
});

// Start and wait for IP
await client.startLxc(newVmid);
const ip = await waitForContainerIp(client, newVmid);
```

## Progress Broadcasting
```typescript
private emitProgress(workspaceId: string, step: StartupStep) {
  const progress = startupProgressStore.setProgress(workspaceId, step);
  getWorkspaceStateBroadcaster().broadcastStartupProgress(progress);
}
```

## Agent Provisioning
```typescript
// Write config
await execSSHCommand({ host: ip, username: 'root' }, ['bash', '-c', `
  cat > /etc/vibe-anywhere-agent.env << 'ENVEOF'
SESSION_HUB_URL=${sessionHubUrl}
WORKSPACE_ID=${workspaceId}
AGENT_TOKEN=${agentToken}
ENVEOF
  chown kobozo:kobozo /etc/vibe-anywhere-agent.env
`]);

// Download and start
await execSSHCommand({ host: ip, username: 'root' }, ['bash', '-c', `
  cd /opt/vibe-anywhere-agent
  curl -fSL -o agent-bundle.tar.gz "${agentBundleUrl}"
  tar -xzf agent-bundle.tar.gz
  chown -R kobozo:kobozo .
  systemctl start vibe-anywhere-agent
`]);
```

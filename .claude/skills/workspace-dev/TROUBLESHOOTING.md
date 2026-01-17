# Workspace Troubleshooting

## Container Doesn't Get IP
**Solution**: Check DHCP service, verify bridge configuration, ensure template has dhclient

## Agent Doesn't Connect
**Solution**: Check agent logs (`journalctl -u vibe-anywhere-agent`), verify WebSocket URL reachable, check token

## Repository Clone Fails
**Solution**: Verify SSH key, test clone manually, check network from container

## Tech Stack Installation Fails
**Solution**: Check install script, verify network, check disk space

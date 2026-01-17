# Real-time Troubleshooting

## WebSocket connection fails
**Solution**: Check CORS, verify path `/socket.io`, test with polling

## Events not received
**Solution**: Verify namespace, check room joined, test emit manually

## Tailscale auth key expired
**Solution**: Generate new key (1 hour timeout), restart Tailscale in container

# WebSocket Guide

## Namespaces
- `/` - Main (browser clients)
- `/agent` - Sidecar agents

## Common Events
**Client → Server:**
- `workspace:state` - State updates
- `tab:output` - Terminal output

**Agent → Server:**
- `register` - Handshake
- `heartbeat` - Keep-alive
- `tab:started` - Tab execution

## Reconnection
```typescript
const socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});
```

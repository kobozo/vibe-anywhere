# Real-time Patterns

## Socket.io Setup
```typescript
const io = new SocketIOServer(server, {
  path: '/socket.io',
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  socket.on('event', (data) => { /* handle */ });
});
```

## Broadcasting
```typescript
// To all clients
io.emit('event', data);

// To room
io.to(workspaceId).emit('event', data);

// To specific socket
socket.emit('event', data);
```

## Tailscale Auth Key
```typescript
const response = await fetch(`https://api.tailscale.com/api/v2/tailnet/${tailnet}/keys`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({
    capabilities: { devices: { create: { ephemeral: true, tags } } },
    expirySeconds: 3600,
  }),
});
```

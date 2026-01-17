# Agent Development Patterns

## WebSocket Event Handler
```typescript
socket.on('new-event', async (data: { param: string }) => {
  console.log('Received:', data);
  const result = await handleEvent(data.param);
  socket.emit('new-event:result', { result });
});
```

## tmux Command
```typescript
async startTab(tabId: string, command: string[]): Promise<number> {
  const windowNum = await this.getNextWindowNumber();
  await this.exec([
    'tmux', 'new-window',
    '-t', `${this.sessionName}:`,
    '-n', String(windowNum),
    command.join(' ')
  ]);
  return windowNum;
}
```

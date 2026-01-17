# Tab Patterns

## Create Tab
```typescript
const [tab] = await db.insert(tabs).values({
  workspaceId,
  name: 'Terminal',
  command: ['/bin/bash'],
  status: 'pending',
  outputBufferSize: 1000,
}).returning();
```

## Start Tab (via Agent)
```typescript
const agent = agentRegistry.getAgent(workspaceId);
agent.socket.emit('tab:start', {
  tabId: tab.id,
  command: tab.command,
});
```

## Buffer Output
```typescript
const buffer = (tab.outputBuffer as OutputEntry[]) || [];
buffer.push({ timestamp: new Date().toISOString(), data });
const trimmed = buffer.slice(-tab.outputBufferSize);
await db.update(tabs).set({ outputBuffer: trimmed }).where(eq(tabs.id, tabId));
```

# Layouts Guide

## Available Layouts
- **horizontal**: Left | Right (2 panes)
- **vertical**: Top / Bottom (2 panes)
- **left-stack**: Left | (Right-Top / Right-Bottom) (3 panes)
- **right-stack**: (Left-Top / Left-Bottom) | Right (3 panes)
- **grid-2x2**: 2x2 grid (4 panes)

## Pane Index
Each tab assigned to pane by index:
- horizontal/vertical: 0, 1
- stacks: 0, 1, 2
- grid-2x2: 0, 1, 2, 3

## Create Group
```typescript
const group = await tabGroupService.createTabGroup(workspaceId, {
  name: 'Development',
  layout: 'horizontal',
});
await tabGroupService.addTabToGroup(group.id, tabId1, 0);
await tabGroupService.addTabToGroup(group.id, tabId2, 1);
```

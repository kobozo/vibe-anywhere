---
name: tab-management
description: Expert agent for tab lifecycle, tab templates, split views, output buffering, and tab group management
tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Bash
model: inherit
permissionMode: default
color: pink
---

# Tab Management Agent

Specialized agent for managing tabs (terminal sessions), tab templates, tab groups, split view layouts, and output buffering within workspaces.

## Core Responsibilities

1. **Tab Lifecycle**: Creation, execution, stopping, deletion
2. **Tab Templates**: Configurable tab types with commands and icons
3. **Tab Groups**: Organizing tabs into split view layouts
4. **Output Buffering**: Capturing and replaying tab output
5. **Auto-Shutdown**: Inactive tab termination

## Key Files

- `src/lib/services/tab-service.ts` - Tab CRUD and lifecycle
- `src/lib/services/tab-template-service.ts` - Tab template management
- `src/lib/services/tab-group-service.ts` - Tab group and layout management
- `src/lib/websocket/tab-stream-manager.ts` - Real-time output streaming
- `src/lib/db/schema.ts` - tabs, tabTemplates, tabGroups tables

## Tab Lifecycle

### Database Schema
```typescript
export const tabs = pgTable('tabs', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: sessionStatusEnum('status').default('pending'), // pending, running, stopped, error
  tabType: tabTypeEnum('tab_type').default('terminal'), // terminal, git, docker, dashboard
  icon: text('icon'), // Icon key: 'claude', 'terminal', 'code'
  isPinned: boolean('is_pinned').default(false),
  sortOrder: integer('sort_order').default(0),
  command: jsonb('command').default(sql`'["/bin/bash"]'::jsonb`), // String array
  exitOnClose: boolean('exit_on_close').default(false), // Kill process when tab closed
  outputBuffer: jsonb('output_buffer').default(sql`'[]'::jsonb`), // Array of output chunks
  outputBufferSize: integer('output_buffer_size').default(1000), // Max buffer size
  autoShutdownMinutes: integer('auto_shutdown_minutes'), // Auto-stop after inactivity
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow(),
  lastActivityAt: timestamp('last_activity_at', { mode: 'string' }).defaultNow(),
});
```

### Tab States
- **pending**: Tab created, not yet started
- **running**: Tab executing command
- **stopped**: Tab stopped (process exited or killed)
- **error**: Tab failed to start

### Tab Creation
```typescript
// src/lib/services/tab-service.ts
async createTab(workspaceId: string, input: CreateTabInput): Promise<Tab> {
  const [tab] = await db.insert(tabs).values({
    workspaceId,
    name: input.name,
    command: input.command || ['/bin/bash'],
    tabType: input.tabType || 'terminal',
    icon: input.icon,
    outputBufferSize: input.outputBufferSize || 1000,
    status: 'pending',
    sortOrder: await this.getNextSortOrder(workspaceId),
  }).returning();

  return tab;
}
```

### Tab Execution
```typescript
async startTab(tabId: string): Promise<void> {
  const tab = await this.getTab(tabId);
  if (!tab) throw new Error('Tab not found');

  // Send start command to agent
  const agentRegistry = getAgentRegistry();
  const agent = agentRegistry.getAgent(tab.workspaceId);

  if (!agent) {
    throw new Error('Agent not connected');
  }

  // Agent will execute command in tmux window
  agent.socket.emit('tab:start', {
    tabId: tab.id,
    command: tab.command as string[],
  });

  // Update status
  await db.update(tabs).set({
    status: 'running',
    updatedAt: sql`NOW()`,
    lastActivityAt: sql`NOW()`,
  }).where(eq(tabs.id, tabId));
}
```

### Tab Stop
```typescript
async stopTab(tabId: string): Promise<void> {
  const tab = await this.getTab(tabId);
  const agent = agentRegistry.getAgent(tab.workspaceId);

  if (agent) {
    agent.socket.emit('tab:stop', { tabId });
  }

  await db.update(tabs).set({
    status: 'stopped',
    updatedAt: sql`NOW()`,
  }).where(eq(tabs.id, tabId));
}
```

## Tab Templates

### Purpose
Predefined tab configurations (Claude CLI, terminal, git, docker, etc.)

### Schema
```typescript
export const tabTemplates = pgTable('tab_templates', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // "Claude", "Terminal", "Git Status"
  icon: text('icon').default('terminal'), // Icon identifier
  command: text('command').notNull(), // "claude", "/bin/bash", "lazygit"
  tabType: tabTypeEnum('tab_type').default('terminal'),
  exitOnClose: boolean('exit_on_close').default(false),
  isBuiltIn: boolean('is_built_in').default(false), // System templates
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow(),
});
```

### Built-in Templates
```typescript
const BUILTIN_TEMPLATES = [
  {
    name: 'Terminal',
    icon: 'terminal',
    command: '/bin/bash',
    tabType: 'terminal',
    exitOnClose: false,
  },
  {
    name: 'Claude',
    icon: 'claude',
    command: 'claude',
    tabType: 'terminal',
    exitOnClose: false,
  },
  {
    name: 'Git Status',
    icon: 'git',
    command: 'lazygit',
    tabType: 'git',
    exitOnClose: true,
  },
  {
    name: 'Docker',
    icon: 'docker',
    command: 'lazydocker',
    tabType: 'docker',
    exitOnClose: true,
  },
];
```

### Create Tab from Template
```typescript
async createTabFromTemplate(workspaceId: string, templateId: string): Promise<Tab> {
  const template = await tabTemplateService.getTemplate(templateId);

  return await this.createTab(workspaceId, {
    name: template.name,
    command: [template.command],
    tabType: template.tabType,
    icon: template.icon,
    exitOnClose: template.exitOnClose,
  });
}
```

## Output Buffering

### Purpose
Capture tab output for reconnection and history replay.

### Buffer Structure
```typescript
// In database (JSONB)
outputBuffer: [
  { timestamp: "2026-01-17T...", data: "Hello\n" },
  { timestamp: "2026-01-17T...", data: "World\n" },
  // ...up to outputBufferSize entries
]
```

### Buffering Logic
```typescript
// src/lib/websocket/tab-stream-manager.ts
class TabStreamManager {
  async appendOutput(tabId: string, data: string) {
    const tab = await tabService.getTab(tabId);

    // Get current buffer
    const buffer = (tab.outputBuffer as OutputEntry[]) || [];

    // Add new entry
    buffer.push({
      timestamp: new Date().toISOString(),
      data,
    });

    // Trim to max size (FIFO)
    const trimmed = buffer.slice(-tab.outputBufferSize);

    // Save back to DB
    await db.update(tabs).set({
      outputBuffer: trimmed,
      updatedAt: sql`NOW()`,
      lastActivityAt: sql`NOW()`,
    }).where(eq(tabs.id, tabId));

    // Broadcast to connected clients
    const broadcaster = getWorkspaceStateBroadcaster();
    broadcaster.broadcastTabOutput(tab.workspaceId, tabId, data);
  }

  async getBuffer(tabId: string): Promise<OutputEntry[]> {
    const tab = await tabService.getTab(tabId);
    return (tab.outputBuffer as OutputEntry[]) || [];
  }
}
```

### Reconnection Flow
1. Client disconnects
2. Agent continues running, output buffered
3. Client reconnects
4. Client requests buffer: `socket.emit('tab:get-buffer', { tabId })`
5. Server sends buffered output
6. Client displays buffer + resumes real-time stream

## Tab Groups

### Purpose
Organize tabs into split view layouts (side-by-side, grid, etc.)

### Schema
```typescript
export const tabGroups = pgTable('tab_groups', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  layout: tabGroupLayoutEnum('layout').default('horizontal'), // horizontal, vertical, grid-2x2, etc.
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow(),
});

export const tabGroupMembers = pgTable('tab_group_members', {
  id: uuid('id').primaryKey(),
  tabGroupId: uuid('tab_group_id').references(() => tabGroups.id, { onDelete: 'cascade' }),
  tabId: uuid('tab_id').references(() => tabs.id, { onDelete: 'cascade' }),
  paneIndex: integer('pane_index').notNull(), // 0, 1, 2, 3 (for grid layouts)
  sortOrder: integer('sort_order').default(0),
});
```

### Layouts
- **horizontal**: Left | Right (2 panes)
- **vertical**: Top / Bottom (2 panes)
- **left-stack**: Left | (Right-Top / Right-Bottom) (3 panes)
- **right-stack**: (Left-Top / Left-Bottom) | Right (3 panes)
- **grid-2x2**: 2x2 grid (4 panes)

### Create Tab Group
```typescript
async createTabGroup(workspaceId: string, input: CreateTabGroupInput): Promise<TabGroup> {
  const [group] = await db.insert(tabGroups).values({
    workspaceId,
    name: input.name,
    layout: input.layout || 'horizontal',
    sortOrder: await this.getNextGroupSortOrder(workspaceId),
  }).returning();

  return group;
}
```

### Add Tab to Group
```typescript
async addTabToGroup(tabGroupId: string, tabId: string, paneIndex: number): Promise<void> {
  await db.insert(tabGroupMembers).values({
    tabGroupId,
    tabId,
    paneIndex,
    sortOrder: await this.getNextMemberSortOrder(tabGroupId),
  });
}
```

### Layout Rendering
```typescript
// Frontend: Render tab group based on layout
function renderTabGroup(group: TabGroup, members: TabGroupMember[]) {
  switch (group.layout) {
    case 'horizontal':
      return <HorizontalSplit panes={[members[0], members[1]]} />;
    case 'vertical':
      return <VerticalSplit panes={[members[0], members[1]]} />;
    case 'grid-2x2':
      return <Grid2x2 panes={members.slice(0, 4)} />;
    // ...
  }
}
```

## Tab Reordering

### Purpose
Drag-and-drop tab reordering in UI.

### Implementation
```typescript
async reorderTabs(workspaceId: string, tabOrder: string[]): Promise<void> {
  // Update sortOrder for each tab
  await Promise.all(
    tabOrder.map((tabId, index) =>
      db.update(tabs).set({
        sortOrder: index,
        updatedAt: sql`NOW()`,
      }).where(eq(tabs.id, tabId))
    )
  );
}
```

## Auto-Shutdown

### Purpose
Stop tabs after period of inactivity (save resources).

### Configuration
```typescript
// Set auto-shutdown on tab
await db.update(tabs).set({
  autoShutdownMinutes: 30, // Stop after 30 minutes of inactivity
}).where(eq(tabs.id, tabId));
```

### Background Job
```typescript
// Run periodically (e.g., every 5 minutes)
async function checkAutoShutdown() {
  const now = Date.now();

  const inactiveTabs = await db.select().from(tabs).where(
    and(
      eq(tabs.status, 'running'),
      isNotNull(tabs.autoShutdownMinutes)
    )
  );

  for (const tab of inactiveTabs) {
    const lastActivity = new Date(tab.lastActivityAt).getTime();
    const shutdownThreshold = tab.autoShutdownMinutes! * 60 * 1000;

    if (now - lastActivity > shutdownThreshold) {
      console.log(`Auto-shutting down tab ${tab.id} after ${tab.autoShutdownMinutes}m inactivity`);
      await tabService.stopTab(tab.id);
    }
  }
}
```

## Common Patterns

### Create Terminal Tab
```typescript
const tab = await tabService.createTab(workspaceId, {
  name: 'Terminal',
  command: ['/bin/bash'],
  tabType: 'terminal',
});
```

### Create Claude Tab
```typescript
const tab = await tabService.createTab(workspaceId, {
  name: 'Claude',
  command: ['claude'],
  tabType: 'terminal',
  icon: 'claude',
});
```

### Pin Tab
```typescript
await db.update(tabs).set({
  isPinned: true,
  updatedAt: sql`NOW()`,
}).where(eq(tabs.id, tabId));
```

### Get All Tabs for Workspace
```typescript
const tabs = await db.select().from(tabs)
  .where(eq(tabs.workspaceId, workspaceId))
  .orderBy(tabs.sortOrder);
```

### Send Input to Tab
```typescript
const agent = agentRegistry.getAgent(tab.workspaceId);
if (agent) {
  agent.socket.emit('tab:input', {
    tabId: tab.id,
    data: 'ls -la\n', // Include newline for command execution
  });
}
```

### Resize Tab Terminal
```typescript
agent.socket.emit('tab:resize', {
  tabId: tab.id,
  rows: 24,
  cols: 80,
});
```

## Common Issues

**Issue**: Tab output not appearing
**Cause**: Agent not connected or tab not started
**Fix**: Verify agent connected, check tab status

**Issue**: Buffer overflow (output too large)
**Cause**: outputBufferSize too small
**Fix**: Increase outputBufferSize for tab

**Issue**: Auto-shutdown not working
**Cause**: Background job not running
**Fix**: Verify cron/scheduler running, check lastActivityAt updates

**Issue**: Tab group layout broken
**Cause**: Wrong paneIndex or missing members
**Fix**: Verify all panes have tabs, check paneIndex values

## Quick Reference

### Tab Types
- `terminal` - General terminal
- `git` - Git operations (lazygit)
- `docker` - Docker management (lazydocker)
- `dashboard` - Monitoring dashboard

### Tab States
- `pending` - Created, not started
- `running` - Executing
- `stopped` - Stopped or exited
- `error` - Failed

### Split Layouts
- `horizontal` - 2 panes (left/right)
- `vertical` - 2 panes (top/bottom)
- `left-stack` - 3 panes (left + right split)
- `right-stack` - 3 panes (left split + right)
- `grid-2x2` - 4 panes (2x2 grid)

### Default Buffer Size
- 1000 entries (configurable per tab)

### Agent Commands
- `tab:start` - Start tab execution
- `tab:stop` - Stop tab
- `tab:input` - Send input
- `tab:resize` - Resize terminal

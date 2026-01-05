import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const sessionStatusEnum = pgEnum('session_status', [
  'pending',
  'starting',
  'running',
  'stopping',
  'stopped',
  'error',
]);

export const containerStatusEnum = pgEnum('container_status', [
  'none',
  'creating',
  'running',
  'paused',
  'exited',
  'dead',
  'removing',
]);

export const workspaceStatusEnum = pgEnum('workspace_status', [
  'pending',
  'active',
  'archived',
]);

export const repoSourceTypeEnum = pgEnum('repo_source_type', [
  'local',
  'cloned',
]);

export const sshKeyTypeEnum = pgEnum('ssh_key_type', [
  'ed25519',
  'rsa',
  'ecdsa',
]);

export const containerBackendEnum = pgEnum('container_backend', [
  'docker',
  'proxmox',
]);

export const portForwardProtocolEnum = pgEnum('port_forward_protocol', [
  'http',
  'tcp',
]);

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  token: text('token').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Repositories table - top-level entity
export const repositories = pgTable('repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  description: text('description'),
  path: text('path').notNull(), // Path relative to APP_HOME_DIR/repositories/ or symlink name
  originalPath: text('original_path'), // Original path for symlinked local repos
  sourceType: repoSourceTypeEnum('source_type').default('local').notNull(),
  cloneUrl: text('clone_url'), // Original URL if cloned
  defaultBranch: text('default_branch').default('main'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Workspaces table - worktrees within a repository
// Each workspace has ONE container that all tabs share
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  repositoryId: uuid('repository_id')
    .references(() => repositories.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  branchName: text('branch_name').notNull(),
  worktreePath: text('worktree_path'), // Relative to APP_HOME_DIR/.worktrees/
  baseCommit: text('base_commit'),
  status: workspaceStatusEnum('status').default('pending').notNull(),
  // Container fields - one container per workspace
  containerId: text('container_id'),
  containerStatus: containerStatusEnum('container_status').default('none').notNull(),
  containerBackend: containerBackendEnum('container_backend').default('docker').notNull(),
  containerIp: text('container_ip'), // IP address for Proxmox LXC containers
  // Agent connection fields (for sidecar agent in containers)
  agentToken: text('agent_token'), // Authentication token for agent
  agentConnectedAt: timestamp('agent_connected_at', { withTimezone: true }), // When agent connected
  agentLastHeartbeat: timestamp('agent_last_heartbeat', { withTimezone: true }), // Last heartbeat
  agentVersion: text('agent_version'), // Agent version string
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull(),
});

// Tabs table - exec sessions within a workspace container
// Each tab represents an exec session running a specific command
export const tabs = pgTable('tabs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  status: sessionStatusEnum('status').default('pending').notNull(),
  command: jsonb('command').$type<string[]>().default(['/bin/bash']), // Command to exec
  outputBuffer: jsonb('output_buffer').$type<string[]>().default([]),
  outputBufferSize: integer('output_buffer_size').default(1000).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull(),
  autoShutdownMinutes: integer('auto_shutdown_minutes'),
});

// SSH Keys table - per-user and per-repository
export const sshKeys = pgTable('ssh_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' }),
  repositoryId: uuid('repository_id')
    .references(() => repositories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  publicKey: text('public_key').notNull(),
  privateKeyEncrypted: text('private_key_encrypted').notNull(),
  keyType: sshKeyTypeEnum('key_type').default('ed25519').notNull(),
  fingerprint: text('fingerprint').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Tab templates - configurable tab types
export const tabTemplates = pgTable('tab_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(), // Display name: "Claude", "LazyGit", etc.
  icon: text('icon').default('terminal'), // Icon identifier
  command: text('command').notNull(), // Command to run: "claude", "lazygit", etc.
  args: jsonb('args').$type<string[]>().default([]), // Command arguments
  description: text('description'), // Optional description
  sortOrder: integer('sort_order').default(0).notNull(),
  isBuiltIn: boolean('is_built_in').default(false).notNull(), // For default templates
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Tab logs (renamed from session_logs)
export const tabLogs = pgTable('tab_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tabId: uuid('tab_id')
    .references(() => tabs.id, { onDelete: 'cascade' })
    .notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  type: text('type').notNull(), // 'stdout' | 'stderr' | 'system' | 'input'
  content: text('content').notNull(),
});

// Port forwarding rules for HAProxy
export const portForwards = pgTable('port_forwards', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .notNull(),
  protocol: portForwardProtocolEnum('protocol').notNull(),
  hostPort: integer('host_port').notNull(),
  containerPort: integer('container_port').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Application settings - key-value store for app configuration
export const appSettings = pgTable('app_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').unique().notNull(),
  value: jsonb('value').$type<unknown>().notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// LEGACY: Sessions table (kept for migration)
// ============================================
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  status: sessionStatusEnum('status').default('pending').notNull(),
  containerId: text('container_id'),
  containerStatus: containerStatusEnum('container_status').default('none').notNull(),
  repoPath: text('repo_path').notNull(),
  branchName: text('branch_name').notNull(),
  worktreePath: text('worktree_path'),
  baseCommit: text('base_commit'),
  claudeCommand: jsonb('claude_command').$type<string[] | null>(),
  outputBuffer: jsonb('output_buffer').$type<string[]>().default([]),
  outputBufferSize: integer('output_buffer_size').default(1000).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull(),
  autoShutdownMinutes: integer('auto_shutdown_minutes'),
});

export const sessionLogs = pgTable('session_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .references(() => sessions.id, { onDelete: 'cascade' })
    .notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  type: text('type').notNull(),
  content: text('content').notNull(),
});

// ============================================
// Relations
// ============================================

export const usersRelations = relations(users, ({ many }) => ({
  repositories: many(repositories),
  sshKeys: many(sshKeys),
  tabTemplates: many(tabTemplates),
  sessions: many(sessions), // Legacy
}));

export const tabTemplatesRelations = relations(tabTemplates, ({ one }) => ({
  user: one(users, {
    fields: [tabTemplates.userId],
    references: [users.id],
  }),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  user: one(users, {
    fields: [repositories.userId],
    references: [users.id],
  }),
  workspaces: many(workspaces),
  sshKeys: many(sshKeys),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [workspaces.repositoryId],
    references: [repositories.id],
  }),
  tabs: many(tabs),
  portForwards: many(portForwards),
}));

export const portForwardsRelations = relations(portForwards, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [portForwards.workspaceId],
    references: [workspaces.id],
  }),
}));

export const tabsRelations = relations(tabs, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [tabs.workspaceId],
    references: [workspaces.id],
  }),
  logs: many(tabLogs),
}));

export const sshKeysRelations = relations(sshKeys, ({ one }) => ({
  user: one(users, {
    fields: [sshKeys.userId],
    references: [users.id],
  }),
  repository: one(repositories, {
    fields: [sshKeys.repositoryId],
    references: [repositories.id],
  }),
}));

export const tabLogsRelations = relations(tabLogs, ({ one }) => ({
  tab: one(tabs, {
    fields: [tabLogs.tabId],
    references: [tabs.id],
  }),
}));

// Legacy relations
export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  logs: many(sessionLogs),
}));

export const sessionLogsRelations = relations(sessionLogs, ({ one }) => ({
  session: one(sessions, {
    fields: [sessionLogs.sessionId],
    references: [sessions.id],
  }),
}));

// ============================================
// Type exports
// ============================================

// Users
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Repositories
export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type RepoSourceType = (typeof repoSourceTypeEnum.enumValues)[number];

// Workspaces
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceStatus = (typeof workspaceStatusEnum.enumValues)[number];

// Tabs
export type Tab = typeof tabs.$inferSelect;
export type NewTab = typeof tabs.$inferInsert;

// SSH Keys
export type SSHKey = typeof sshKeys.$inferSelect;
export type NewSSHKey = typeof sshKeys.$inferInsert;
export type SSHKeyType = (typeof sshKeyTypeEnum.enumValues)[number];

// Tab Logs
export type TabLog = typeof tabLogs.$inferSelect;
export type NewTabLog = typeof tabLogs.$inferInsert;

// Tab Templates
export type TabTemplate = typeof tabTemplates.$inferSelect;
export type NewTabTemplate = typeof tabTemplates.$inferInsert;

// Legacy (Sessions)
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SessionLog = typeof sessionLogs.$inferSelect;
export type NewSessionLog = typeof sessionLogs.$inferInsert;

// Port Forwards
export type PortForward = typeof portForwards.$inferSelect;
export type NewPortForward = typeof portForwards.$inferInsert;
export type PortForwardProtocol = (typeof portForwardProtocolEnum.enumValues)[number];

// App Settings
export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;

// Shared enums
export type SessionStatus = (typeof sessionStatusEnum.enumValues)[number];
export type ContainerStatus = (typeof containerStatusEnum.enumValues)[number];
export type ContainerBackend = (typeof containerBackendEnum.enumValues)[number];

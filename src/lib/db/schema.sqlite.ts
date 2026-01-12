import {
  sqliteTable,
  text,
  integer,
  index,
  unique,
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Helper to generate UUID-like IDs (SQLite doesn't have native UUID)
// We'll use TEXT with default value
const uuid = (name: string) => text(name).primaryKey().$defaultFn(() => crypto.randomUUID());
const uuidRef = (name: string) => text(name);

// Helper for timestamps (raw Unix milliseconds as integers)
const timestamp = (name: string) => integer(name);

// Helper for boolean (SQLite stores as INTEGER 0/1)
const boolean = (name: string) => integer(name, { mode: 'boolean' });

// Helper for JSONB (SQLite stores as TEXT) - manual serialization required
// Note: No automatic JSON serialization. Application code must JSON.stringify/parse.
const jsonb = <T>(name: string) => text(name).$type<T>();

// Environment variable entry type for JSONB storage
export interface EnvVarEntry {
  value: string;      // Plain text or encrypted string
  encrypted: boolean; // Whether value is encrypted at rest
}
export type EnvVarsJson = Record<string, EnvVarEntry>;

// Git hook entry type for JSONB storage
export interface GitHookEntry {
  content: string;      // Hook script content (base64 encoded)
  executable: boolean;  // Whether hook should be executable
}
export type GitHooksJson = Record<string, GitHookEntry>;

// Enum types (SQLite uses TEXT with CHECK constraints)
export type SessionStatus = 'pending' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error' | 'restarting';
export type ContainerStatus = 'none' | 'creating' | 'running' | 'paused' | 'exited' | 'dead' | 'removing';
export type WorkspaceStatus = 'pending' | 'active' | 'archived';
export type SSHKeyType = 'ed25519' | 'rsa' | 'ecdsa';
export type ContainerBackend = 'docker' | 'proxmox';
export type TabType = 'terminal' | 'git' | 'docker' | 'dashboard';
export type PortForwardProtocol = 'http' | 'tcp';
export type TabGroupLayout = 'horizontal' | 'vertical' | 'left-stack' | 'right-stack' | 'grid-2x2';
export type TemplateStatus = 'pending' | 'provisioning' | 'staging' | 'ready' | 'error';

// Users table
export const users = sqliteTable('users', {
  id: uuid('id'),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  token: text('token').unique(),
  forcePasswordChange: boolean('force_password_change').default(false).notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

// Git Identities table
export const gitIdentities = sqliteTable('git_identities', {
  id: uuid('id'),
  userId: uuidRef('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  gitName: text('git_name').notNull(),
  gitEmail: text('git_email').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

// Proxmox Templates table
export const proxmoxTemplates = sqliteTable('proxmox_templates', {
  id: uuid('id'),
  userId: uuidRef('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  parentTemplateId: uuidRef('parent_template_id'),
  baseCtTemplate: text('base_ct_template'),
  name: text('name').notNull(),
  description: text('description'),
  vmid: integer('vmid').unique(),
  node: text('node'),
  storage: text('storage'),
  status: text('status').$type<TemplateStatus>().default('pending').notNull(),
  techStacks: jsonb<string[]>('tech_stacks').default([]),
  inheritedTechStacks: jsonb<string[]>('inherited_tech_stacks').default([]),
  isDefault: boolean('is_default').default(false).notNull(),
  errorMessage: text('error_message'),
  stagingContainerIp: text('staging_container_ip'),
  envVars: jsonb<EnvVarsJson>('env_vars').default({}),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

// Repositories table
export const repositories = sqliteTable('repositories', {
  id: uuid('id'),
  userId: uuidRef('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  templateId: uuidRef('template_id'),
  sshKeyId: uuidRef('ssh_key_id'),
  name: text('name').notNull(),
  description: text('description'),
  cloneUrl: text('clone_url').notNull(),
  cloneDepth: integer('clone_depth'),
  defaultBranch: text('default_branch').default('main'),
  techStack: jsonb<string[]>('tech_stack').default([]),
  envVars: jsonb<EnvVarsJson>('env_vars').default({}),
  gitHooks: jsonb<GitHooksJson>('git_hooks').default({}),
  cachedBranches: jsonb<string[]>('cached_branches').default([]),
  branchesCachedAt: integer('branches_cached_at'), // Unix timestamp ms
  resourceMemory: integer('resource_memory'),
  resourceCpuCores: integer('resource_cpu_cores'),
  resourceDiskSize: integer('resource_disk_size'),
  gitIdentityId: uuidRef('git_identity_id'),
  gitCustomName: text('git_custom_name'),
  gitCustomEmail: text('git_custom_email'),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

// Workspaces table
export const workspaces = sqliteTable('workspaces', {
  id: uuid('id'),
  repositoryId: uuidRef('repository_id').references(() => repositories.id, { onDelete: 'cascade' }).notNull(),
  templateId: uuidRef('template_id').references(() => proxmoxTemplates.id),
  name: text('name').notNull(),
  branchName: text('branch_name').notNull(),
  status: text('status').$type<WorkspaceStatus>().default('pending').notNull(),
  containerId: text('container_id'),
  containerStatus: text('container_status').$type<ContainerStatus>().default('none').notNull(),
  containerBackend: text('container_backend').$type<ContainerBackend>().default('proxmox').notNull(),
  containerIp: text('container_ip'),
  hasUncommittedChanges: boolean('has_uncommitted_changes').default(false).notNull(),
  agentToken: text('agent_token'),
  agentConnectedAt: integer('agent_connected_at'), // Unix timestamp ms
  agentLastHeartbeat: integer('agent_last_heartbeat'), // Unix timestamp ms
  agentVersion: text('agent_version'),
  staticIpAddress: text('static_ip_address'),
  staticIpGateway: text('static_ip_gateway'),
  forcedVmid: integer('forced_vmid'),
  overrideTemplateId: uuidRef('override_template_id').references(() => proxmoxTemplates.id),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
  lastActivityAt: integer('last_activity_at').notNull().$defaultFn(() => Date.now()),
});

// Tabs table
export const tabs = sqliteTable('tabs', {
  id: uuid('id'),
  workspaceId: uuidRef('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  status: text('status').$type<SessionStatus>().default('pending').notNull(),
  tabType: text('tab_type').$type<TabType>().default('terminal').notNull(),
  icon: text('icon'),
  isPinned: boolean('is_pinned').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  command: jsonb<string[]>('command').default(['/bin/bash']),
  exitOnClose: boolean('exit_on_close').default(false).notNull(),
  outputBuffer: jsonb<string[]>('output_buffer').default([]),
  outputBufferSize: integer('output_buffer_size').default(1000).notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
  lastActivityAt: integer('last_activity_at').notNull().$defaultFn(() => Date.now()),
  autoShutdownMinutes: integer('auto_shutdown_minutes'),
});

// SSH Keys table
export const sshKeys = sqliteTable('ssh_keys', {
  id: uuid('id'),
  userId: uuidRef('user_id').references(() => users.id, { onDelete: 'cascade' }),
  repositoryId: uuidRef('repository_id').references(() => repositories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  publicKey: text('public_key').notNull(),
  privateKeyEncrypted: text('private_key_encrypted').notNull(),
  keyType: text('key_type').$type<SSHKeyType>().default('ed25519').notNull(),
  fingerprint: text('fingerprint').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

// Tab templates
export const tabTemplates = sqliteTable('tab_templates', {
  id: uuid('id'),
  userId: uuidRef('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  icon: text('icon').default('terminal'),
  command: text('command').notNull(),
  args: jsonb<string[]>('args').default([]),
  description: text('description'),
  exitOnClose: boolean('exit_on_close').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isBuiltIn: boolean('is_built_in').default(false).notNull(),
  requiredTechStack: text('required_tech_stack'),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

// Tab logs
export const tabLogs = sqliteTable('tab_logs', {
  id: uuid('id'),
  tabId: uuidRef('tab_id').references(() => tabs.id, { onDelete: 'cascade' }).notNull(),
  timestamp: integer('timestamp').notNull().$defaultFn(() => Date.now()),
  type: text('type').notNull(),
  content: text('content').notNull(),
});

// Port forwarding rules
export const portForwards = sqliteTable('port_forwards', {
  id: uuid('id'),
  workspaceId: uuidRef('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  protocol: text('protocol').$type<PortForwardProtocol>().notNull(),
  hostPort: integer('host_port').notNull(),
  containerPort: integer('container_port').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

// Tab groups
export const tabGroups = sqliteTable('tab_groups', {
  id: uuid('id'),
  workspaceId: uuidRef('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  layout: text('layout').$type<TabGroupLayout>().default('horizontal').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

// Tab group members
export const tabGroupMembers = sqliteTable('tab_group_members', {
  id: uuid('id'),
  groupId: uuidRef('group_id').references(() => tabGroups.id, { onDelete: 'cascade' }).notNull(),
  tabId: uuidRef('tab_id').references(() => tabs.id, { onDelete: 'cascade' }).notNull(),
  paneIndex: integer('pane_index').default(0).notNull(),
  sizePercent: integer('size_percent').default(50).notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
});

// Application settings
export const appSettings = sqliteTable('app_settings', {
  id: uuid('id'),
  key: text('key').unique().notNull(),
  value: jsonb<unknown>('value').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

// Secrets Vault
export const secrets = sqliteTable('secrets', {
  id: uuid('id'),
  userId: uuidRef('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  envKey: text('env_key').notNull(),
  valueEncrypted: text('value_encrypted').notNull(),
  description: text('description'),
  templateWhitelist: jsonb<string[]>('template_whitelist').default([]).notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
}, (table) => ({
  userIdIdx: index('secrets_user_id_idx').on(table.userId),
}));

// Repository-Secret association table
export const repositorySecrets = sqliteTable('repository_secrets', {
  id: uuid('id'),
  repositoryId: uuidRef('repository_id').references(() => repositories.id, { onDelete: 'cascade' }).notNull(),
  secretId: uuidRef('secret_id').references(() => secrets.id, { onDelete: 'cascade' }).notNull(),
  includeInEnvFile: boolean('include_in_env_file').default(false).notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
}, (table) => ({
  uniqueRepoSecret: unique('unique_repo_secret').on(table.repositoryId, table.secretId),
  repoIdIdx: index('repository_secrets_repo_id_idx').on(table.repositoryId),
  secretIdIdx: index('repository_secrets_secret_id_idx').on(table.secretId),
}));

// LEGACY: Sessions table
export const sessions = sqliteTable('sessions', {
  id: uuid('id'),
  name: text('name').notNull(),
  description: text('description'),
  userId: uuidRef('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').$type<SessionStatus>().default('pending').notNull(),
  containerId: text('container_id'),
  containerStatus: text('container_status').$type<ContainerStatus>().default('none').notNull(),
  repoPath: text('repo_path').notNull(),
  branchName: text('branch_name').notNull(),
  worktreePath: text('worktree_path'),
  baseCommit: text('base_commit'),
  claudeCommand: jsonb<string[] | null>('claude_command'),
  outputBuffer: jsonb<string[]>('output_buffer').default([]),
  outputBufferSize: integer('output_buffer_size').default(1000).notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
  lastActivityAt: integer('last_activity_at').notNull().$defaultFn(() => Date.now()),
  autoShutdownMinutes: integer('auto_shutdown_minutes'),
});

export const sessionLogs = sqliteTable('session_logs', {
  id: uuid('id'),
  sessionId: uuidRef('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),
  timestamp: integer('timestamp').notNull().$defaultFn(() => Date.now()),
  type: text('type').notNull(),
  content: text('content').notNull(),
});

// Relations (same as PostgreSQL schema)
export const usersRelations = relations(users, ({ many }) => ({
  repositories: many(repositories),
  sshKeys: many(sshKeys),
  tabTemplates: many(tabTemplates),
  proxmoxTemplates: many(proxmoxTemplates),
  gitIdentities: many(gitIdentities),
  secrets: many(secrets),
  sessions: many(sessions),
}));

export const tabTemplatesRelations = relations(tabTemplates, ({ one }) => ({
  user: one(users, {
    fields: [tabTemplates.userId],
    references: [users.id],
  }),
}));

export const gitIdentitiesRelations = relations(gitIdentities, ({ one, many }) => ({
  user: one(users, {
    fields: [gitIdentities.userId],
    references: [users.id],
  }),
  repositories: many(repositories),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  user: one(users, {
    fields: [repositories.userId],
    references: [users.id],
  }),
  template: one(proxmoxTemplates, {
    fields: [repositories.templateId],
    references: [proxmoxTemplates.id],
  }),
  sshKey: one(sshKeys, {
    fields: [repositories.sshKeyId],
    references: [sshKeys.id],
  }),
  gitIdentity: one(gitIdentities, {
    fields: [repositories.gitIdentityId],
    references: [gitIdentities.id],
  }),
  workspaces: many(workspaces),
  sshKeys: many(sshKeys),
  repositorySecrets: many(repositorySecrets),
}));

export const proxmoxTemplatesRelations = relations(proxmoxTemplates, ({ one, many }) => ({
  user: one(users, {
    fields: [proxmoxTemplates.userId],
    references: [users.id],
  }),
  parentTemplate: one(proxmoxTemplates, {
    fields: [proxmoxTemplates.parentTemplateId],
    references: [proxmoxTemplates.id],
    relationName: 'templateInheritance',
  }),
  childTemplates: many(proxmoxTemplates, {
    relationName: 'templateInheritance',
  }),
  repositories: many(repositories),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [workspaces.repositoryId],
    references: [repositories.id],
  }),
  template: one(proxmoxTemplates, {
    fields: [workspaces.templateId],
    references: [proxmoxTemplates.id],
    relationName: 'workspaceTemplate',
  }),
  overrideTemplate: one(proxmoxTemplates, {
    fields: [workspaces.overrideTemplateId],
    references: [proxmoxTemplates.id],
    relationName: 'workspaceOverrideTemplate',
  }),
  tabs: many(tabs),
  portForwards: many(portForwards),
  tabGroups: many(tabGroups),
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
  groupMemberships: many(tabGroupMembers),
}));

export const tabGroupsRelations = relations(tabGroups, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [tabGroups.workspaceId],
    references: [workspaces.id],
  }),
  members: many(tabGroupMembers),
}));

export const tabGroupMembersRelations = relations(tabGroupMembers, ({ one }) => ({
  group: one(tabGroups, {
    fields: [tabGroupMembers.groupId],
    references: [tabGroups.id],
  }),
  tab: one(tabs, {
    fields: [tabGroupMembers.tabId],
    references: [tabs.id],
  }),
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

export const secretsRelations = relations(secrets, ({ one, many }) => ({
  user: one(users, {
    fields: [secrets.userId],
    references: [users.id],
  }),
  repositorySecrets: many(repositorySecrets),
}));

export const repositorySecretsRelations = relations(repositorySecrets, ({ one }) => ({
  repository: one(repositories, {
    fields: [repositorySecrets.repositoryId],
    references: [repositories.id],
  }),
  secret: one(secrets, {
    fields: [repositorySecrets.secretId],
    references: [secrets.id],
  }),
}));

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

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type Tab = typeof tabs.$inferSelect;
export type NewTab = typeof tabs.$inferInsert;
export type SSHKey = typeof sshKeys.$inferSelect;
export type NewSSHKey = typeof sshKeys.$inferInsert;
export type GitIdentity = typeof gitIdentities.$inferSelect;
export type NewGitIdentity = typeof gitIdentities.$inferInsert;
export type TabLog = typeof tabLogs.$inferSelect;
export type NewTabLog = typeof tabLogs.$inferInsert;
export type TabTemplate = typeof tabTemplates.$inferSelect;
export type NewTabTemplate = typeof tabTemplates.$inferInsert;
export type ProxmoxTemplate = typeof proxmoxTemplates.$inferSelect;
export type NewProxmoxTemplate = typeof proxmoxTemplates.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SessionLog = typeof sessionLogs.$inferSelect;
export type NewSessionLog = typeof sessionLogs.$inferInsert;
export type PortForward = typeof portForwards.$inferSelect;
export type NewPortForward = typeof portForwards.$inferInsert;
export type TabGroup = typeof tabGroups.$inferSelect;
export type NewTabGroup = typeof tabGroups.$inferInsert;
export type TabGroupMember = typeof tabGroupMembers.$inferSelect;
export type NewTabGroupMember = typeof tabGroupMembers.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
export type Secret = typeof secrets.$inferSelect;
export type NewSecret = typeof secrets.$inferInsert;
export type RepositorySecret = typeof repositorySecrets.$inferSelect;
export type NewRepositorySecret = typeof repositorySecrets.$inferInsert;

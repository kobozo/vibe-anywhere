import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  pgEnum,
  index,
  unique,
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
  'restarting',
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

// DEPRECATED: repoSourceTypeEnum removed - repos are always cloned in containers
// The enum still exists in DB for backward compatibility with legacy sessions API

export const sshKeyTypeEnum = pgEnum('ssh_key_type', [
  'ed25519',
  'rsa',
  'ecdsa',
]);

export const containerBackendEnum = pgEnum('container_backend', [
  'docker',
  'proxmox',
]);

export const tabTypeEnum = pgEnum('tab_type', [
  'terminal',
  'git',
  'docker',
  'dashboard',
]);

export const portForwardProtocolEnum = pgEnum('port_forward_protocol', [
  'http',
  'tcp',
]);

export const tabGroupLayoutEnum = pgEnum('tab_group_layout', [
  'horizontal',     // Left/Right (2 panes)
  'vertical',       // Top/Bottom (2 panes)
  'left-stack',     // Left + Right-Top/Right-Bottom (3 panes)
  'right-stack',    // Left-Top/Left-Bottom + Right (3 panes)
  'grid-2x2',       // 2x2 grid (4 panes)
]);

export const templateStatusEnum = pgEnum('template_status', [
  'pending',
  'provisioning',
  'staging',
  'ready',
  'error',
]);

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

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  token: text('token').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Git Identities table - named git configurations for commits
export const gitIdentities = pgTable('git_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(), // Display name: "Work", "Personal", etc.
  gitName: text('git_name').notNull(), // Git config user.name
  gitEmail: text('git_email').notNull(), // Git config user.email
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Proxmox Templates table - LXC templates with different tech stacks
export const proxmoxTemplates = pgTable('proxmox_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  parentTemplateId: uuid('parent_template_id'), // Self-reference for template inheritance
  baseCtTemplate: text('base_ct_template'), // CT template used as base (e.g., 'debian-12-standard', 'ubuntu-22.04-standard')
  name: text('name').notNull(),
  description: text('description'),
  vmid: integer('vmid').unique(), // Actual Proxmox VMID (null until created)
  node: text('node'), // Proxmox node
  storage: text('storage'), // Storage used
  status: templateStatusEnum('status').default('pending').notNull(),
  techStacks: jsonb('tech_stacks').$type<string[]>().default([]), // New tech stacks added to this template
  inheritedTechStacks: jsonb('inherited_tech_stacks').$type<string[]>().default([]), // Tech stacks inherited from parent
  isDefault: boolean('is_default').default(false).notNull(),
  errorMessage: text('error_message'), // Error details if status is 'error'
  stagingContainerIp: text('staging_container_ip'), // IP address when in staging mode
  envVars: jsonb('env_vars').$type<EnvVarsJson>().default({}), // Environment variables for containers
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Repositories table - top-level entity
// Repositories are cloned directly in containers - no local storage
export const repositories = pgTable('repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  templateId: uuid('template_id'), // FK to proxmoxTemplates (constraint in DB, relation defined below)
  sshKeyId: uuid('ssh_key_id'), // FK to sshKeys - the SSH key to use for this repository
  name: text('name').notNull(),
  description: text('description'),
  cloneUrl: text('clone_url').notNull(), // Remote URL for git clone
  cloneDepth: integer('clone_depth'), // null = full clone, positive int = shallow clone depth
  defaultBranch: text('default_branch').default('main'),
  techStack: jsonb('tech_stack').$type<string[]>().default([]), // Tech stack IDs to install on workspaces (override template)
  envVars: jsonb('env_vars').$type<EnvVarsJson>().default({}), // Environment variables for containers (overrides template)
  gitHooks: jsonb('git_hooks').$type<GitHooksJson>().default({}), // Git hooks to sync to workspaces
  // Cached branch info from remote (fetched via git ls-remote)
  cachedBranches: jsonb('cached_branches').$type<string[]>().default([]),
  branchesCachedAt: timestamp('branches_cached_at', { withTimezone: true }),
  // Resource overrides (null = use global defaults from settings)
  resourceMemory: integer('resource_memory'), // Memory in MB
  resourceCpuCores: integer('resource_cpu_cores'), // CPU cores
  resourceDiskSize: integer('resource_disk_size'), // Disk size in GB
  // Git identity configuration (null = use default identity)
  gitIdentityId: uuid('git_identity_id'), // FK to gitIdentities (use saved identity)
  gitCustomName: text('git_custom_name'), // Custom git user.name (if not using saved identity)
  gitCustomEmail: text('git_custom_email'), // Custom git user.email (if not using saved identity)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Workspaces table - branches within a repository
// Each workspace has ONE container that all tabs share
// Repository is cloned directly in container when it starts
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  repositoryId: uuid('repository_id')
    .references(() => repositories.id, { onDelete: 'cascade' })
    .notNull(),
  templateId: uuid('template_id').references(() => proxmoxTemplates.id), // Template used for this workspace
  name: text('name').notNull(),
  branchName: text('branch_name').notNull(),
  status: workspaceStatusEnum('status').default('pending').notNull(),
  // Container fields - one container per workspace
  containerId: text('container_id'),
  containerStatus: containerStatusEnum('container_status').default('none').notNull(),
  containerBackend: containerBackendEnum('container_backend').default('docker').notNull(),
  containerIp: text('container_ip'), // IP address for Proxmox LXC containers
  // Git status tracking
  hasUncommittedChanges: boolean('has_uncommitted_changes').default(false).notNull(), // Cached flag for UI warning
  // Agent connection fields (for sidecar agent in containers)
  agentToken: text('agent_token'), // Authentication token for agent
  agentConnectedAt: timestamp('agent_connected_at', { withTimezone: true }), // When agent connected
  agentLastHeartbeat: timestamp('agent_last_heartbeat', { withTimezone: true }), // Last heartbeat
  agentVersion: text('agent_version'), // Agent version string
  // Advanced creation options (nullable = use defaults)
  staticIpAddress: text('static_ip_address'), // CIDR format: 192.168.3.50/24
  staticIpGateway: text('static_ip_gateway'), // Gateway IP: 192.168.3.1
  forcedVmid: integer('forced_vmid'), // Force specific VMID instead of auto-allocation
  overrideTemplateId: uuid('override_template_id').references(() => proxmoxTemplates.id), // Override repository template
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
  tabType: tabTypeEnum('tab_type').default('terminal').notNull(),
  icon: text('icon'), // Icon key from template (e.g., 'claude', 'terminal', 'code')
  isPinned: boolean('is_pinned').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  command: jsonb('command').$type<string[]>().default(['/bin/bash']), // Command to exec
  exitOnClose: boolean('exit_on_close').default(false).notNull(), // Append && exit to command
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
  name: text('name').notNull(), // Display name: "Claude", "Terminal", etc.
  icon: text('icon').default('terminal'), // Icon identifier
  command: text('command').notNull(), // Command to run: "claude", "/bin/bash", etc.
  args: jsonb('args').$type<string[]>().default([]), // Command arguments
  description: text('description'), // Optional description
  exitOnClose: boolean('exit_on_close').default(false).notNull(), // Append && exit to command
  sortOrder: integer('sort_order').default(0).notNull(),
  isBuiltIn: boolean('is_built_in').default(false).notNull(), // For default templates
  requiredTechStack: text('required_tech_stack'), // Tech stack ID required to show this template (nullable)
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

// Tab groups - for split view layouts
export const tabGroups = pgTable('tab_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  layout: tabGroupLayoutEnum('layout').default('horizontal').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Tab group members - panes within a group
export const tabGroupMembers = pgTable('tab_group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .references(() => tabGroups.id, { onDelete: 'cascade' })
    .notNull(),
  tabId: uuid('tab_id')
    .references(() => tabs.id, { onDelete: 'cascade' })
    .notNull(),
  paneIndex: integer('pane_index').default(0).notNull(),
  sizePercent: integer('size_percent').default(50).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
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
// Secrets Vault - User-level encrypted environment variables
// ============================================
export const secrets = pgTable('secrets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  envKey: text('env_key').notNull(),
  valueEncrypted: text('value_encrypted').notNull(),
  description: text('description'),
  templateWhitelist: jsonb('template_whitelist').$type<string[]>().default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('secrets_user_id_idx').on(table.userId),
}));

// Repository-Secret association table (normalized join table)
export const repositorySecrets = pgTable('repository_secrets', {
  id: uuid('id').primaryKey().defaultRandom(),
  repositoryId: uuid('repository_id')
    .references(() => repositories.id, { onDelete: 'cascade' })
    .notNull(),
  secretId: uuid('secret_id')
    .references(() => secrets.id, { onDelete: 'cascade' })
    .notNull(),
  includeInEnvFile: boolean('include_in_env_file').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueRepoSecret: unique('unique_repo_secret').on(table.repositoryId, table.secretId),
  repoIdIdx: index('repository_secrets_repo_id_idx').on(table.repositoryId),
  secretIdIdx: index('repository_secrets_secret_id_idx').on(table.secretId),
}));

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
  proxmoxTemplates: many(proxmoxTemplates),
  gitIdentities: many(gitIdentities),
  secrets: many(secrets),
  sessions: many(sessions), // Legacy
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

// Workspaces
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceStatus = (typeof workspaceStatusEnum.enumValues)[number];

// Tabs
export type Tab = typeof tabs.$inferSelect;
export type NewTab = typeof tabs.$inferInsert;
export type TabType = (typeof tabTypeEnum.enumValues)[number];

// SSH Keys
export type SSHKey = typeof sshKeys.$inferSelect;
export type NewSSHKey = typeof sshKeys.$inferInsert;
export type SSHKeyType = (typeof sshKeyTypeEnum.enumValues)[number];

// Git Identities
export type GitIdentity = typeof gitIdentities.$inferSelect;
export type NewGitIdentity = typeof gitIdentities.$inferInsert;

// Tab Logs
export type TabLog = typeof tabLogs.$inferSelect;
export type NewTabLog = typeof tabLogs.$inferInsert;

// Tab Templates
export type TabTemplate = typeof tabTemplates.$inferSelect;
export type NewTabTemplate = typeof tabTemplates.$inferInsert;

// Proxmox Templates
export type ProxmoxTemplate = typeof proxmoxTemplates.$inferSelect;
export type NewProxmoxTemplate = typeof proxmoxTemplates.$inferInsert;
export type TemplateStatus = (typeof templateStatusEnum.enumValues)[number];

// Legacy (Sessions)
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SessionLog = typeof sessionLogs.$inferSelect;
export type NewSessionLog = typeof sessionLogs.$inferInsert;

// Port Forwards
export type PortForward = typeof portForwards.$inferSelect;
export type NewPortForward = typeof portForwards.$inferInsert;
export type PortForwardProtocol = (typeof portForwardProtocolEnum.enumValues)[number];

// Tab Groups
export type TabGroup = typeof tabGroups.$inferSelect;
export type NewTabGroup = typeof tabGroups.$inferInsert;
export type TabGroupMember = typeof tabGroupMembers.$inferSelect;
export type NewTabGroupMember = typeof tabGroupMembers.$inferInsert;
export type TabGroupLayout = (typeof tabGroupLayoutEnum.enumValues)[number];

// App Settings
export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;

// Secrets Vault
export type Secret = typeof secrets.$inferSelect;
export type NewSecret = typeof secrets.$inferInsert;
export type RepositorySecret = typeof repositorySecrets.$inferSelect;
export type NewRepositorySecret = typeof repositorySecrets.$inferInsert;

// Shared enums
export type SessionStatus = (typeof sessionStatusEnum.enumValues)[number];
export type ContainerStatus = (typeof containerStatusEnum.enumValues)[number];
export type ContainerBackend = (typeof containerBackendEnum.enumValues)[number];

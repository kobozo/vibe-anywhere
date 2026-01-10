import { z } from 'zod';

const envSchema = z.object({
  // Database - empty string uses SQLite default, otherwise must be valid URL
  DATABASE_URL: z.string().refine(
    (val) => val === '' || z.string().url().safeParse(val).success,
    { message: 'DATABASE_URL must be empty (for SQLite) or a valid URL' }
  ).default(''),

  // Server
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Authentication
  AUTH_SECRET: z.string().min(16),

  // App Home Directory - where all repos, worktrees, and SSH keys are stored
  APP_HOME_DIR: z.string().default('/opt/vibe-anywhere'),

  // DEPRECATED: Git worktrees are no longer used. Repos are cloned directly in containers.
  // These are kept only for legacy session API backward compatibility.
  BASE_REPO_PATH: z.string().optional(),
  WORKTREE_BASE_PATH: z.string().optional(),

  // Container Backend (Proxmox only)
  CONTAINER_BACKEND: z.enum(['proxmox']).default('proxmox'),

  // Proxmox Configuration
  PROXMOX_HOST: z.string().optional(),
  PROXMOX_PORT: z.string().default('8006').transform(Number),
  PROXMOX_TOKEN_ID: z.string().optional(),      // e.g., 'root@pam!vibe-anywhere'
  PROXMOX_TOKEN_SECRET: z.string().optional(),
  PROXMOX_NODE: z.string().optional(),          // e.g., 'pve'
  PROXMOX_STORAGE: z.string().default('local-lvm'),
  PROXMOX_BRIDGE: z.string().default('vmbr0'),
  PROXMOX_VLAN_TAG: z.string().optional().transform(v => v ? Number(v) : undefined),
  PROXMOX_SSH_USER: z.string().default('kobozo'),
  PROXMOX_SSH_PRIVATE_KEY_PATH: z.string().optional(),
  PROXMOX_MEMORY_MB: z.string().default('2048').transform(Number),
  PROXMOX_CORES: z.string().default('2').transform(Number),
  PROXMOX_CLAUDE_CONFIG_PATH: z.string().optional(), // Path to host .claude dir for LXC mount
  PROXMOX_TEMPLATE_VMID: z.string().default('150').transform(Number),
  PROXMOX_VMID_MIN: z.string().default('200').transform(Number),
  PROXMOX_VMID_MAX: z.string().default('299').transform(Number),

  // Session settings
  SESSION_IDLE_TIMEOUT_MINUTES: z.string().default('60').transform(Number),
  OUTPUT_BUFFER_SIZE: z.string().default('1000').transform(Number),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment configuration:');
    console.error(result.error.format());
    throw new Error('Invalid environment configuration');
  }

  return result.data;
}

// Lazy-loaded config singleton
let _config: Env | null = null;

export function getConfig(): Env {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

// For use in places where we need individual values
export const config = {
  get database() {
    return {
      url: getConfig().DATABASE_URL,
    };
  },

  get server() {
    return {
      port: getConfig().PORT,
      isDev: getConfig().NODE_ENV === 'development',
      isProd: getConfig().NODE_ENV === 'production',
    };
  },

  get auth() {
    return {
      secret: getConfig().AUTH_SECRET,
    };
  },

  get appHome() {
    const homeDir = getConfig().APP_HOME_DIR;
    return {
      root: homeDir,
      // SSH keys are stored encrypted in database; this path is only for temp files
      // during key generation (ssh-keygen) and git operations (requires file paths)
      sshKeys: `/tmp/vibe-anywhere-ssh-keys`,
      // DEPRECATED: Repositories are now cloned directly in containers
      // These paths are kept for legacy session API backward compatibility
      repositories: `${homeDir}/repositories`,
      worktrees: `${homeDir}/.worktrees`,
    };
  },

  /**
   * @deprecated Git worktrees on host are no longer used.
   * Repositories are cloned directly in containers.
   * This config section is kept for legacy session API backward compatibility.
   */
  get git() {
    const homeDir = getConfig().APP_HOME_DIR;
    return {
      baseRepoPath: getConfig().BASE_REPO_PATH,
      worktreeBasePath: getConfig().WORKTREE_BASE_PATH || `${homeDir}/.worktrees`,
    };
  },

  get session() {
    return {
      idleTimeoutMinutes: getConfig().SESSION_IDLE_TIMEOUT_MINUTES,
      outputBufferSize: getConfig().OUTPUT_BUFFER_SIZE,
    };
  },

  get container() {
    return {
      backend: getConfig().CONTAINER_BACKEND,
    };
  },

  /**
   * Static Proxmox config from .env (fallback values)
   * For runtime config that includes DB settings, use getProxmoxRuntimeConfig()
   */
  get proxmox() {
    const cfg = getConfig();
    return {
      host: cfg.PROXMOX_HOST,
      port: cfg.PROXMOX_PORT,
      tokenId: cfg.PROXMOX_TOKEN_ID,
      tokenSecret: cfg.PROXMOX_TOKEN_SECRET,
      node: cfg.PROXMOX_NODE,
      storage: cfg.PROXMOX_STORAGE,
      bridge: cfg.PROXMOX_BRIDGE,
      vlanTag: cfg.PROXMOX_VLAN_TAG,
      sshUser: cfg.PROXMOX_SSH_USER,
      sshPrivateKeyPath: cfg.PROXMOX_SSH_PRIVATE_KEY_PATH,
      memoryMb: cfg.PROXMOX_MEMORY_MB,
      cores: cfg.PROXMOX_CORES,
      claudeConfigPath: cfg.PROXMOX_CLAUDE_CONFIG_PATH,
      templateVmid: cfg.PROXMOX_TEMPLATE_VMID,
      vmidRange: {
        min: cfg.PROXMOX_VMID_MIN,
        max: cfg.PROXMOX_VMID_MAX,
      },
    };
  },
};

/**
 * Runtime Proxmox configuration (DB-first with .env fallback)
 */
export interface ProxmoxRuntimeConfig {
  host?: string;
  port: number;
  tokenId?: string;
  tokenSecret?: string;
  node?: string;
  storage: string;
  bridge: string;
  vlanTag?: number;
  sshUser: string;
  sshPrivateKeyPath?: string;
  memoryMb: number;
  cores: number;
  claudeConfigPath?: string;
  templateVmid: number;
  vmidRange: {
    min: number;
    max: number;
  };
}

// Import settings service lazily to avoid circular dependencies
let _settingsServiceModule: typeof import('./services/settings-service') | null = null;

async function getSettingsServiceModule() {
  if (!_settingsServiceModule) {
    _settingsServiceModule = await import('./services/settings-service');
  }
  return _settingsServiceModule;
}

/**
 * Get Proxmox runtime configuration.
 * Checks database first, falls back to .env values.
 * Use this for all runtime Proxmox operations.
 */
export async function getProxmoxRuntimeConfig(): Promise<ProxmoxRuntimeConfig> {
  const envConfig = config.proxmox;

  try {
    const settingsModule = await getSettingsServiceModule();
    const settingsService = settingsModule.getSettingsService();

    // Get DB settings
    const dbConnection = await settingsService.getProxmoxConnectionSettings();
    const dbSettings = await settingsService.getProxmoxSettings();

    // If DB has connection settings, prefer DB values
    if (dbConnection?.host) {
      return {
        // Connection from DB (required if DB is configured)
        host: dbConnection.host,
        port: dbConnection.port,
        tokenId: dbConnection.tokenId,
        tokenSecret: dbConnection.tokenSecret,
        node: dbConnection.node,

        // Other settings from DB with .env fallback
        storage: dbSettings.defaultStorage ?? envConfig.storage,
        bridge: dbSettings.bridge ?? envConfig.bridge,
        vlanTag: dbSettings.vlanTag ?? envConfig.vlanTag,
        sshUser: dbSettings.sshUser ?? envConfig.sshUser,
        sshPrivateKeyPath: dbSettings.sshPrivateKeyPath ?? envConfig.sshPrivateKeyPath,
        memoryMb: dbSettings.defaultMemory ?? envConfig.memoryMb,
        cores: dbSettings.defaultCpuCores ?? envConfig.cores,
        claudeConfigPath: dbSettings.claudeConfigPath ?? envConfig.claudeConfigPath,
        templateVmid: envConfig.templateVmid, // Template VMID managed separately
        vmidRange: {
          min: dbSettings.vmidMin ?? envConfig.vmidRange.min,
          max: dbSettings.vmidMax ?? envConfig.vmidRange.max,
        },
      };
    }

    // No DB connection settings, use .env values but merge any DB general settings
    return {
      host: envConfig.host,
      port: envConfig.port,
      tokenId: envConfig.tokenId,
      tokenSecret: envConfig.tokenSecret,
      node: envConfig.node,
      storage: dbSettings.defaultStorage ?? envConfig.storage,
      bridge: dbSettings.bridge ?? envConfig.bridge,
      vlanTag: dbSettings.vlanTag ?? envConfig.vlanTag,
      sshUser: dbSettings.sshUser ?? envConfig.sshUser,
      sshPrivateKeyPath: dbSettings.sshPrivateKeyPath ?? envConfig.sshPrivateKeyPath,
      memoryMb: dbSettings.defaultMemory ?? envConfig.memoryMb,
      cores: dbSettings.defaultCpuCores ?? envConfig.cores,
      claudeConfigPath: dbSettings.claudeConfigPath ?? envConfig.claudeConfigPath,
      templateVmid: envConfig.templateVmid,
      vmidRange: {
        min: dbSettings.vmidMin ?? envConfig.vmidRange.min,
        max: dbSettings.vmidMax ?? envConfig.vmidRange.max,
      },
    };
  } catch (error) {
    // Log the actual error for debugging
    console.error('[Proxmox Config] Failed to load database settings:', error);

    // If DB fails, fall back to .env config entirely (only if .env has required values)
    if (envConfig.host && envConfig.tokenId && envConfig.tokenSecret && envConfig.node) {
      console.warn('[Proxmox Config] Falling back to .env configuration');
      return {
        host: envConfig.host,
        port: envConfig.port,
        tokenId: envConfig.tokenId,
        tokenSecret: envConfig.tokenSecret,
        node: envConfig.node,
        storage: envConfig.storage,
        bridge: envConfig.bridge,
        vlanTag: envConfig.vlanTag,
        sshUser: envConfig.sshUser,
        sshPrivateKeyPath: envConfig.sshPrivateKeyPath,
        memoryMb: envConfig.memoryMb,
        cores: envConfig.cores,
        claudeConfigPath: envConfig.claudeConfigPath,
        templateVmid: envConfig.templateVmid,
        vmidRange: envConfig.vmidRange,
      };
    }

    // No valid config in DB or .env, throw informative error
    throw new Error(
      'Proxmox configuration unavailable. Please configure Proxmox in Settings > Proxmox. ' +
      `Database error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check if Proxmox is configured (either in DB or .env)
 */
export async function isProxmoxConfigured(): Promise<boolean> {
  const runtimeConfig = await getProxmoxRuntimeConfig();
  return !!(runtimeConfig.host && runtimeConfig.tokenId && runtimeConfig.tokenSecret && runtimeConfig.node);
}

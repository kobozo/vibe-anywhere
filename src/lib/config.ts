import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Server
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Authentication
  AUTH_SECRET: z.string().min(16),

  // App Home Directory - where all repos, worktrees, and SSH keys are stored
  APP_HOME_DIR: z.string().default('/opt/session-hub'),

  // Git Configuration (legacy - kept for backwards compatibility)
  BASE_REPO_PATH: z.string().optional(),
  WORKTREE_BASE_PATH: z.string().optional(), // Now derived from APP_HOME_DIR

  // Container Backend Selection ('docker' or 'proxmox')
  CONTAINER_BACKEND: z.enum(['docker', 'proxmox']).default('docker'),

  // Docker Configuration
  DOCKER_SOCKET: z.string().default('/var/run/docker.sock'),
  CLAUDE_IMAGE: z.string().default('session-hub/claude-instance:latest'),

  // Proxmox Configuration (required if CONTAINER_BACKEND='proxmox')
  PROXMOX_HOST: z.string().optional(),
  PROXMOX_PORT: z.string().default('8006').transform(Number),
  PROXMOX_TOKEN_ID: z.string().optional(),      // e.g., 'root@pam!session-hub'
  PROXMOX_TOKEN_SECRET: z.string().optional(),
  PROXMOX_NODE: z.string().optional(),          // e.g., 'pve'
  PROXMOX_TEMPLATE_VMID: z.string().optional().transform(v => v ? Number(v) : undefined),
  PROXMOX_STORAGE: z.string().default('local-lvm'),
  PROXMOX_BRIDGE: z.string().default('vmbr0'),
  PROXMOX_VLAN_TAG: z.string().optional().transform(v => v ? Number(v) : undefined),
  PROXMOX_SSH_USER: z.string().default('root'),
  PROXMOX_SSH_PRIVATE_KEY_PATH: z.string().optional(),
  PROXMOX_VMID_MIN: z.string().default('200').transform(Number),
  PROXMOX_VMID_MAX: z.string().default('299').transform(Number),
  PROXMOX_MEMORY_MB: z.string().default('2048').transform(Number),
  PROXMOX_CORES: z.string().default('2').transform(Number),
  PROXMOX_CLAUDE_CONFIG_PATH: z.string().optional(), // Path to host .claude dir for LXC mount

  // Anthropic API (passed to containers)
  ANTHROPIC_API_KEY: z.string().optional(),

  // Container resource limits (Docker)
  CONTAINER_MEMORY_LIMIT: z.string().default('2g'),
  CONTAINER_CPU_LIMIT: z.string().default('2').transform(Number),

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
      repositories: `${homeDir}/repositories`,
      worktrees: `${homeDir}/.worktrees`,
      sshKeys: `${homeDir}/.ssh/keys`,
    };
  },

  get git() {
    const homeDir = getConfig().APP_HOME_DIR;
    return {
      baseRepoPath: getConfig().BASE_REPO_PATH, // Legacy, optional
      worktreeBasePath: getConfig().WORKTREE_BASE_PATH || `${homeDir}/.worktrees`,
    };
  },

  get docker() {
    return {
      socketPath: getConfig().DOCKER_SOCKET,
      claudeImage: getConfig().CLAUDE_IMAGE,
      memoryLimit: getConfig().CONTAINER_MEMORY_LIMIT,
      cpuLimit: getConfig().CONTAINER_CPU_LIMIT,
    };
  },

  get anthropic() {
    return {
      apiKey: getConfig().ANTHROPIC_API_KEY,
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

  get proxmox() {
    const cfg = getConfig();
    return {
      host: cfg.PROXMOX_HOST,
      port: cfg.PROXMOX_PORT,
      tokenId: cfg.PROXMOX_TOKEN_ID,
      tokenSecret: cfg.PROXMOX_TOKEN_SECRET,
      node: cfg.PROXMOX_NODE,
      templateVmid: cfg.PROXMOX_TEMPLATE_VMID,
      storage: cfg.PROXMOX_STORAGE,
      bridge: cfg.PROXMOX_BRIDGE,
      vlanTag: cfg.PROXMOX_VLAN_TAG,
      sshUser: cfg.PROXMOX_SSH_USER,
      sshPrivateKeyPath: cfg.PROXMOX_SSH_PRIVATE_KEY_PATH,
      vmidRange: {
        min: cfg.PROXMOX_VMID_MIN,
        max: cfg.PROXMOX_VMID_MAX,
      },
      memoryMb: cfg.PROXMOX_MEMORY_MB,
      cores: cfg.PROXMOX_CORES,
      claudeConfigPath: cfg.PROXMOX_CLAUDE_CONFIG_PATH,
    };
  },
};

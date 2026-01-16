/**
 * Settings Service
 * Manages application settings stored in the database
 */

import { db } from '@/lib/db';
import { appSettings, workspaces } from '@/lib/db/schema';
import { eq , sql } from 'drizzle-orm';
import { getProxmoxClientAsync } from '@/lib/container/proxmox/client';
import { config } from '@/lib/config';
import * as crypto from 'crypto';

// Encryption constants (AES-256-GCM, same as SSH keys)
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Known setting keys
export const SETTINGS_KEYS = {
  PROXMOX_TEMPLATE: 'proxmox.template',
  PROXMOX_VMID_CONFIG: 'proxmox.vmidConfig',
  PROXMOX_SETTINGS: 'proxmox.settings',
  PROXMOX_CONNECTION: 'proxmox.connection',
  OPENAI_API_KEY: 'openai.apiKey',
  TAILSCALE_OAUTH_TOKEN: 'tailscale.oauthToken',
} as const;

// Default starting VMID for Proxmox containers
export const DEFAULT_STARTING_VMID = 500;

export type SettingsKey = typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS];

export interface ProxmoxTemplateSettings {
  vmid: number;
  node: string;
  createdAt: string;
  storage: string;
}

export interface ProxmoxVmidConfig {
  startingVmid: number;
  nextWorkspaceVmid: number;  // Next available VMID for workspaces
  maxVmid?: number;           // Maximum VMID for containers
}

/**
 * Proxmox connection settings (stored encrypted)
 */
export interface ProxmoxConnectionSettings {
  host: string;
  port: number;
  tokenId: string;
  node: string;
}

/**
 * Internal storage format for connection settings (with encrypted token)
 */
interface ProxmoxConnectionSettingsStored {
  host: string;
  port: number;
  tokenId: string;
  encryptedTokenSecret: string;
  node: string;
}

/**
 * Full connection settings including decrypted token (for runtime use)
 */
export interface ProxmoxConnectionSettingsFull extends ProxmoxConnectionSettings {
  tokenSecret: string;
}

/**
 * General Proxmox settings (VLAN, defaults for new containers)
 */
export interface ProxmoxSettings {
  // Network
  bridge?: string;            // Network bridge (e.g., vmbr0)
  vlanTag?: number;           // Default VLAN tag for containers

  // Resources
  defaultStorage?: string;    // Default storage ID
  defaultMemory?: number;     // Default memory in MB
  defaultCpuCores?: number;   // Default CPU cores
  defaultDiskSize?: number;   // Default disk size in GB (e.g., 50)

  // SSH/Container access
  sshUser?: string;           // SSH user for container access
  sshPrivateKeyPath?: string; // Path to SSH private key
  claudeConfigPath?: string;  // Path to Claude config

  // VMID range
  vmidMin?: number;           // Minimum VMID for containers
  vmidMax?: number;           // Maximum VMID for containers

  // Default CT template for new templates (e.g., 'debian-12-standard')
  defaultCtTemplate?: string;
}

export class SettingsService {
  /**
   * Get a setting value by key
   */
  async get<T>(key: SettingsKey): Promise<T | null> {
    const result = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const value = result[0].value;
    // Parse JSON if it's a string
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    }
    return value as T;
  }

  /**
   * Set a setting value
   */
  async set<T>(key: SettingsKey, value: T, description?: string): Promise<void> {
    const existing = await this.get(key);

    if (existing !== null) {
      await db
        .update(appSettings)
        .set({
          value: JSON.stringify(value),
          description,
          updatedAt: sql`NOW()`,
        })
        .where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({
        key,
        value: JSON.stringify(value),
        description,
      });
    }
  }

  /**
   * Delete a setting
   */
  async delete(key: SettingsKey): Promise<void> {
    await db.delete(appSettings).where(eq(appSettings.key, key));
  }

  /**
   * Get the VMID configuration
   */
  async getVmidConfig(): Promise<ProxmoxVmidConfig> {
    const config = await this.get<ProxmoxVmidConfig>(SETTINGS_KEYS.PROXMOX_VMID_CONFIG);
    if (config) {
      return config;
    }
    // Return defaults if not configured
    return {
      startingVmid: DEFAULT_STARTING_VMID,
      nextWorkspaceVmid: DEFAULT_STARTING_VMID + 1,
    };
  }

  /**
   * Save the VMID configuration
   */
  async saveVmidConfig(config: ProxmoxVmidConfig): Promise<void> {
    await this.set(
      SETTINGS_KEYS.PROXMOX_VMID_CONFIG,
      config,
      'Proxmox VMID allocation configuration'
    );
  }

  /**
   * Get the template VMID (starting VMID)
   */
  async getTemplateVmid(): Promise<number> {
    const config = await this.getVmidConfig();
    return config.startingVmid;
  }

  /**
   * Allocate the next available VMID for a workspace
   * Finds the first free VMID by checking both Proxmox and database
   */
  async allocateWorkspaceVmid(): Promise<number> {
    const vmidConfig = await this.getVmidConfig();
    const maxVmid = vmidConfig.maxVmid || vmidConfig.startingVmid + 1000;

    // Get all VMIDs currently in use in Proxmox
    let proxmoxVmids = new Set<number>();
    try {
      const client = await getProxmoxClientAsync();
      const containers = await client.getLxcContainers();
      proxmoxVmids = new Set(containers.map(c => c.vmid));
    } catch (error) {
      console.warn('Could not fetch Proxmox containers, using database-only check:', error);
    }

    // Get VMIDs from workspaces table (Proxmox backend only)
    const dbWorkspaces = await db
      .select({ containerId: workspaces.containerId })
      .from(workspaces)
      .where(eq(workspaces.containerBackend, 'proxmox'));

    const dbVmids = new Set(
      dbWorkspaces
        .filter(w => w.containerId !== null)
        .map(w => parseInt(w.containerId!, 10))
    );

    // Combine both sets
    const usedVmids = new Set([...proxmoxVmids, ...dbVmids]);

    // Find first free VMID starting after template VMID
    for (let vmid = vmidConfig.startingVmid + 1; vmid <= maxVmid; vmid++) {
      if (!usedVmids.has(vmid)) {
        return vmid;
      }
    }

    throw new Error(
      `No available VMIDs in range ${vmidConfig.startingVmid + 1}-${maxVmid}. All VMIDs are in use.`
    );
  }

  /**
   * Get the Proxmox template settings
   */
  async getProxmoxTemplateSettings(): Promise<ProxmoxTemplateSettings | null> {
    return await this.get<ProxmoxTemplateSettings>(SETTINGS_KEYS.PROXMOX_TEMPLATE);
  }

  /**
   * Get the Proxmox template VMID
   */
  async getProxmoxTemplateVmid(): Promise<number | null> {
    const settings = await this.get<ProxmoxTemplateSettings>(SETTINGS_KEYS.PROXMOX_TEMPLATE);
    return settings?.vmid ?? null;
  }

  /**
   * Save the Proxmox template settings after creation
   */
  async saveProxmoxTemplateSettings(settings: ProxmoxTemplateSettings): Promise<void> {
    await this.set(
      SETTINGS_KEYS.PROXMOX_TEMPLATE,
      settings,
      'Proxmox LXC template configuration'
    );
  }

  /**
   * Clear the Proxmox template settings (after deletion)
   */
  async clearProxmoxTemplateSettings(): Promise<void> {
    await this.delete(SETTINGS_KEYS.PROXMOX_TEMPLATE);
  }

  // ============================================
  // Proxmox General Settings
  // ============================================

  /**
   * Get Proxmox general settings
   */
  async getProxmoxSettings(): Promise<ProxmoxSettings> {
    const settings = await this.get<ProxmoxSettings>(SETTINGS_KEYS.PROXMOX_SETTINGS);
    return settings ?? {};
  }

  /**
   * Save Proxmox general settings
   */
  async saveProxmoxSettings(settings: ProxmoxSettings): Promise<void> {
    await this.set(
      SETTINGS_KEYS.PROXMOX_SETTINGS,
      settings,
      'Proxmox general settings (VLAN, defaults)'
    );
  }

  /**
   * Get VLAN tag from settings (falls back to undefined if not set)
   */
  async getVlanTag(): Promise<number | undefined> {
    const settings = await this.getProxmoxSettings();
    return settings.vlanTag;
  }

  // ============================================
  // OpenAI API Key (Encrypted)
  // ============================================

  /**
   * Get the encryption key derived from AUTH_SECRET
   */
  private getEncryptionKey(): Buffer {
    return crypto.scryptSync(config.auth.secret, 'openai-key-salt', 32);
  }

  /**
   * Encrypt a value using AES-256-GCM
   */
  private encrypt(value: string): string {
    const encryptionKey = this.getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);

    let encrypted = cipher.update(value, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]).toString('base64');
  }

  /**
   * Decrypt a value using AES-256-GCM
   */
  private decrypt(encryptedData: string): string {
    const encryptionKey = this.getEncryptionKey();
    const data = Buffer.from(encryptedData, 'base64');

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Save the OpenAI API key (encrypted)
   */
  async saveOpenAIApiKey(apiKey: string): Promise<void> {
    const encryptedKey = this.encrypt(apiKey);
    await this.set(
      SETTINGS_KEYS.OPENAI_API_KEY,
      { encryptedKey },
      'OpenAI API key for Whisper transcription'
    );
  }

  /**
   * Get the decrypted OpenAI API key
   */
  async getOpenAIApiKey(): Promise<string | null> {
    const data = await this.get<{ encryptedKey: string }>(SETTINGS_KEYS.OPENAI_API_KEY);
    if (!data?.encryptedKey) {
      return null;
    }
    try {
      return this.decrypt(data.encryptedKey);
    } catch {
      return null;
    }
  }

  /**
   * Clear the OpenAI API key
   */
  async clearOpenAIApiKey(): Promise<void> {
    await this.delete(SETTINGS_KEYS.OPENAI_API_KEY);
  }

  /**
   * Check if Whisper is configured (has OpenAI API key)
   */
  async isWhisperConfigured(): Promise<boolean> {
    const data = await this.get<{ encryptedKey: string }>(SETTINGS_KEYS.OPENAI_API_KEY);
    return !!data?.encryptedKey;
  }

  // ============================================
  // Proxmox Connection Settings (Encrypted Token)
  // ============================================

  /**
   * Get the encryption key for Proxmox token (separate from OpenAI key)
   */
  private getProxmoxEncryptionKey(): Buffer {
    return crypto.scryptSync(config.auth.secret, 'proxmox-token-salt', 32);
  }

  /**
   * Encrypt a value using AES-256-GCM (for Proxmox token)
   */
  private encryptProxmox(value: string): string {
    const encryptionKey = this.getProxmoxEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);

    let encrypted = cipher.update(value, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]).toString('base64');
  }

  /**
   * Decrypt a value using AES-256-GCM (for Proxmox token)
   */
  private decryptProxmox(encryptedData: string): string {
    const encryptionKey = this.getProxmoxEncryptionKey();
    const data = Buffer.from(encryptedData, 'base64');

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Save Proxmox connection settings (encrypts token)
   */
  async saveProxmoxConnectionSettings(
    settings: ProxmoxConnectionSettings,
    tokenSecret: string
  ): Promise<void> {
    const stored: ProxmoxConnectionSettingsStored = {
      host: settings.host,
      port: settings.port,
      tokenId: settings.tokenId,
      node: settings.node,
      encryptedTokenSecret: this.encryptProxmox(tokenSecret),
    };

    await this.set(
      SETTINGS_KEYS.PROXMOX_CONNECTION,
      stored,
      'Proxmox API connection settings'
    );
  }

  /**
   * Get Proxmox connection settings (decrypts token)
   */
  async getProxmoxConnectionSettings(): Promise<ProxmoxConnectionSettingsFull | null> {
    const stored = await this.get<ProxmoxConnectionSettingsStored>(
      SETTINGS_KEYS.PROXMOX_CONNECTION
    );

    if (!stored?.host || !stored?.encryptedTokenSecret) {
      return null;
    }

    try {
      return {
        host: stored.host,
        port: stored.port,
        tokenId: stored.tokenId,
        node: stored.node,
        tokenSecret: this.decryptProxmox(stored.encryptedTokenSecret),
      };
    } catch {
      return null;
    }
  }

  /**
   * Clear Proxmox connection settings
   */
  async clearProxmoxConnectionSettings(): Promise<void> {
    await this.delete(SETTINGS_KEYS.PROXMOX_CONNECTION);
  }

  /**
   * Check if Proxmox connection is configured
   */
  async isProxmoxConnectionConfigured(): Promise<boolean> {
    const stored = await this.get<ProxmoxConnectionSettingsStored>(
      SETTINGS_KEYS.PROXMOX_CONNECTION
    );
    return !!stored?.host && !!stored?.encryptedTokenSecret;
  }

  // ============================================
  // Tailscale OAuth Token (Encrypted)
  // ============================================

  /**
   * Get the encryption key for Tailscale OAuth token
   */
  private getTailscaleEncryptionKey(): Buffer {
    return crypto.scryptSync(config.auth.secret, 'tailscale-token-salt', 32);
  }

  /**
   * Encrypt a value using AES-256-GCM (for Tailscale OAuth token)
   */
  private encryptTailscale(value: string): string {
    const encryptionKey = this.getTailscaleEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);

    let encrypted = cipher.update(value, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]).toString('base64');
  }

  /**
   * Decrypt a value using AES-256-GCM (for Tailscale OAuth token)
   */
  private decryptTailscale(encryptedData: string): string {
    const encryptionKey = this.getTailscaleEncryptionKey();
    const data = Buffer.from(encryptedData, 'base64');

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Save Tailscale OAuth token (encrypted)
   */
  async saveTailscaleOAuthToken(token: string): Promise<void> {
    const encryptedToken = this.encryptTailscale(token);
    await this.set(
      SETTINGS_KEYS.TAILSCALE_OAUTH_TOKEN,
      { encryptedToken },
      'Tailscale OAuth token for ephemeral auth key generation'
    );
  }

  /**
   * Get the decrypted Tailscale OAuth token
   */
  async getTailscaleOAuthToken(): Promise<string | null> {
    const data = await this.get<{ encryptedToken: string }>(SETTINGS_KEYS.TAILSCALE_OAUTH_TOKEN);
    if (!data?.encryptedToken) {
      return null;
    }
    try {
      return this.decryptTailscale(data.encryptedToken);
    } catch {
      return null;
    }
  }

  /**
   * Clear the Tailscale OAuth token
   */
  async clearTailscaleOAuthToken(): Promise<void> {
    await this.delete(SETTINGS_KEYS.TAILSCALE_OAUTH_TOKEN);
  }

  /**
   * Check if Tailscale is configured (has OAuth token)
   */
  async isTailscaleConfigured(): Promise<boolean> {
    const data = await this.get<{ encryptedToken: string }>(SETTINGS_KEYS.TAILSCALE_OAUTH_TOKEN);
    return !!data?.encryptedToken;
  }
}

// No singleton - always create new instance to avoid caching issues
export function getSettingsService(): SettingsService {
  return new SettingsService();
}


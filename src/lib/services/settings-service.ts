/**
 * Settings Service
 * Manages application settings stored in the database
 */

import { db } from '@/lib/db';
import { appSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Known setting keys
export const SETTINGS_KEYS = {
  PROXMOX_TEMPLATE: 'proxmox.template',
  PROXMOX_VMID_CONFIG: 'proxmox.vmidConfig',
  PROXMOX_SETTINGS: 'proxmox.settings',
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
}

/**
 * General Proxmox settings (VLAN, defaults for new containers)
 */
export interface ProxmoxSettings {
  vlanTag?: number;           // Default VLAN tag for containers
  defaultStorage?: string;    // Default storage ID
  defaultMemory?: number;     // Default memory in MB
  defaultCpuCores?: number;   // Default CPU cores
}

class SettingsService {
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

    return result[0].value as T;
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
          value: value as unknown,
          description,
          updatedAt: new Date(),
        })
        .where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({
        key,
        value: value as unknown,
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
   */
  async allocateWorkspaceVmid(): Promise<number> {
    const config = await this.getVmidConfig();
    const vmid = config.nextWorkspaceVmid;

    // Increment for next allocation
    await this.saveVmidConfig({
      ...config,
      nextWorkspaceVmid: vmid + 1,
    });

    return vmid;
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
}

// Singleton instance
let settingsServiceInstance: SettingsService | null = null;

export function getSettingsService(): SettingsService {
  if (!settingsServiceInstance) {
    settingsServiceInstance = new SettingsService();
  }
  return settingsServiceInstance;
}

export { SettingsService };

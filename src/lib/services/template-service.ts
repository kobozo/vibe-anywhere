/**
 * Template Service
 * Manages Proxmox LXC templates with different tech stacks
 */

import { eq, desc, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  proxmoxTemplates,
  repositories,
  type ProxmoxTemplate,
  type NewProxmoxTemplate,
  type TemplateStatus,
} from '@/lib/db/schema';
import { getSettingsService } from './settings-service';

export interface CreateTemplateInput {
  name: string;
  description?: string;
  techStacks?: string[];
  isDefault?: boolean;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  isDefault?: boolean;
}

export class TemplateService {
  /**
   * List all templates for a user
   */
  async listTemplates(userId: string): Promise<ProxmoxTemplate[]> {
    return db
      .select()
      .from(proxmoxTemplates)
      .where(eq(proxmoxTemplates.userId, userId))
      .orderBy(desc(proxmoxTemplates.createdAt));
  }

  /**
   * Get a template by ID
   */
  async getTemplate(templateId: string): Promise<ProxmoxTemplate | null> {
    const [template] = await db
      .select()
      .from(proxmoxTemplates)
      .where(eq(proxmoxTemplates.id, templateId));
    return template || null;
  }

  /**
   * Get the default template for a user
   */
  async getDefaultTemplate(userId: string): Promise<ProxmoxTemplate | null> {
    const [template] = await db
      .select()
      .from(proxmoxTemplates)
      .where(
        and(
          eq(proxmoxTemplates.userId, userId),
          eq(proxmoxTemplates.isDefault, true)
        )
      );

    if (template) {
      return template;
    }

    // If no default, return the first template
    const [firstTemplate] = await db
      .select()
      .from(proxmoxTemplates)
      .where(eq(proxmoxTemplates.userId, userId))
      .orderBy(desc(proxmoxTemplates.createdAt))
      .limit(1);

    return firstTemplate || null;
  }

  /**
   * Create a new template record (pre-provisioning)
   */
  async createTemplate(
    userId: string,
    input: CreateTemplateInput
  ): Promise<ProxmoxTemplate> {
    // If this is the first template or marked as default, unset other defaults
    if (input.isDefault) {
      await this.clearDefaultTemplates(userId);
    }

    // Check if this is the first template for the user
    const existingTemplates = await this.listTemplates(userId);
    const isFirstTemplate = existingTemplates.length === 0;

    const [template] = await db
      .insert(proxmoxTemplates)
      .values({
        userId,
        name: input.name,
        description: input.description || null,
        techStacks: input.techStacks || [],
        isDefault: input.isDefault || isFirstTemplate, // First template is always default
        status: 'pending',
      })
      .returning();

    return template;
  }

  /**
   * Update a template (name, description, default status only)
   */
  async updateTemplate(
    templateId: string,
    updates: UpdateTemplateInput
  ): Promise<ProxmoxTemplate> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // If setting as default, unset other defaults first
    if (updates.isDefault) {
      await this.clearDefaultTemplates(template.userId);
    }

    const [updated] = await db
      .update(proxmoxTemplates)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(proxmoxTemplates.id, templateId))
      .returning();

    return updated;
  }

  /**
   * Update template status and provisioning details
   */
  async updateTemplateStatus(
    templateId: string,
    status: TemplateStatus,
    vmid?: number,
    node?: string,
    storage?: string,
    errorMessage?: string
  ): Promise<void> {
    await db
      .update(proxmoxTemplates)
      .set({
        status,
        vmid: vmid ?? undefined,
        node: node ?? undefined,
        storage: storage ?? undefined,
        errorMessage: errorMessage ?? null,
        updatedAt: new Date(),
      })
      .where(eq(proxmoxTemplates.id, templateId));
  }

  /**
   * Delete a template
   * Resets all repositories using this template to the default template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Find the default template for this user (excluding the one being deleted)
    const [defaultTemplate] = await db
      .select()
      .from(proxmoxTemplates)
      .where(
        and(
          eq(proxmoxTemplates.userId, template.userId),
          eq(proxmoxTemplates.isDefault, true)
        )
      );

    // Get replacement template (default or first available)
    let replacementTemplateId: string | null = null;
    if (defaultTemplate && defaultTemplate.id !== templateId) {
      replacementTemplateId = defaultTemplate.id;
    } else {
      // Find another template
      const [otherTemplate] = await db
        .select()
        .from(proxmoxTemplates)
        .where(eq(proxmoxTemplates.userId, template.userId))
        .orderBy(desc(proxmoxTemplates.createdAt))
        .limit(2);

      if (otherTemplate && otherTemplate.id !== templateId) {
        replacementTemplateId = otherTemplate.id;
      }
    }

    // Reset all repositories using this template to the replacement
    await db
      .update(repositories)
      .set({
        templateId: replacementTemplateId,
        updatedAt: new Date(),
      })
      .where(eq(repositories.templateId, templateId));

    // Delete the template
    await db.delete(proxmoxTemplates).where(eq(proxmoxTemplates.id, templateId));

    // If this was the default template and we have a replacement, make it default
    if (template.isDefault && replacementTemplateId) {
      await db
        .update(proxmoxTemplates)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(proxmoxTemplates.id, replacementTemplateId));
    }
  }

  /**
   * Set a template as the default
   */
  async setDefaultTemplate(userId: string, templateId: string): Promise<void> {
    // Verify template exists and belongs to user
    const template = await this.getTemplate(templateId);
    if (!template || template.userId !== userId) {
      throw new Error(`Template ${templateId} not found or access denied`);
    }

    // Clear existing defaults
    await this.clearDefaultTemplates(userId);

    // Set new default
    await db
      .update(proxmoxTemplates)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(proxmoxTemplates.id, templateId));
  }

  /**
   * Clear all default flags for a user's templates
   */
  private async clearDefaultTemplates(userId: string): Promise<void> {
    await db
      .update(proxmoxTemplates)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(proxmoxTemplates.userId, userId));
  }

  /**
   * Allocate the next available VMID for a template
   */
  async allocateTemplateVmid(): Promise<number> {
    const settingsService = getSettingsService();
    const config = await settingsService.getVmidConfig();

    // Templates use the starting VMID and increment
    // Find the highest template VMID currently in use
    const templates = await db
      .select({ vmid: proxmoxTemplates.vmid })
      .from(proxmoxTemplates)
      .where(eq(proxmoxTemplates.vmid, proxmoxTemplates.vmid)); // vmid is not null

    let maxVmid = config.startingVmid - 1;
    for (const t of templates) {
      if (t.vmid && t.vmid > maxVmid) {
        maxVmid = t.vmid;
      }
    }

    return maxVmid + 1;
  }

  /**
   * Get the template VMID for a repository
   * Looks up via repository -> template
   */
  async getTemplateVmidForRepository(repositoryId: string): Promise<number | null> {
    // Get the repository with its template
    const [repo] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, repositoryId));

    if (!repo) {
      return null;
    }

    // If repository has a specific template, use it
    if (repo.templateId) {
      const template = await this.getTemplate(repo.templateId);
      if (template && template.vmid && template.status === 'ready') {
        return template.vmid;
      }
    }

    // Otherwise, try to get the default template for the user
    const defaultTemplate = await this.getDefaultTemplate(repo.userId);
    if (defaultTemplate && defaultTemplate.vmid && defaultTemplate.status === 'ready') {
      return defaultTemplate.vmid;
    }

    // Fall back to the old settings-based template VMID for backwards compatibility
    const settingsService = getSettingsService();
    return await settingsService.getProxmoxTemplateVmid();
  }

  /**
   * Get template for a repository (full object)
   */
  async getTemplateForRepository(repositoryId: string): Promise<ProxmoxTemplate | null> {
    const [repo] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, repositoryId));

    if (!repo) {
      return null;
    }

    // If repository has a specific template, use it
    if (repo.templateId) {
      const template = await this.getTemplate(repo.templateId);
      if (template) {
        return template;
      }
    }

    // Otherwise, get the default template for the user
    return await this.getDefaultTemplate(repo.userId);
  }
}

// Singleton instance
let templateServiceInstance: TemplateService | null = null;

export function getTemplateService(): TemplateService {
  if (!templateServiceInstance) {
    templateServiceInstance = new TemplateService();
  }
  return templateServiceInstance;
}

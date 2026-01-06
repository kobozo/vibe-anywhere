/**
 * Template Service
 * Manages Proxmox LXC templates with different tech stacks
 */

import { eq, desc, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  proxmoxTemplates,
  repositories,
  workspaces,
  type ProxmoxTemplate,
  type NewProxmoxTemplate,
  type TemplateStatus,
} from '@/lib/db/schema';
import { getSettingsService } from './settings-service';
import { getProxmoxClientAsync } from '@/lib/container/proxmox/client';

export interface CreateTemplateInput {
  name: string;
  description?: string;
  techStacks?: string[];
  isDefault?: boolean;
  parentTemplateId?: string; // Clone from this template
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
   * Validate that a template can be used as a parent (must be "ready" and owned by user)
   */
  async validateParentTemplate(
    parentId: string,
    userId: string
  ): Promise<ProxmoxTemplate> {
    const parent = await this.getTemplate(parentId);

    if (!parent) {
      throw new Error('Parent template not found');
    }

    if (parent.userId !== userId) {
      throw new Error('Cannot clone template from another user');
    }

    if (parent.status !== 'ready') {
      throw new Error('Parent template must be in "ready" status to clone');
    }

    if (!parent.vmid) {
      throw new Error('Parent template has no VMID');
    }

    return parent;
  }

  /**
   * Get all effective tech stacks for a template (inherited + own)
   */
  getEffectiveTechStacks(template: ProxmoxTemplate): string[] {
    return [
      ...(template.inheritedTechStacks || []),
      ...(template.techStacks || []),
    ];
  }

  /**
   * Get the parent template's VMID for cloning
   */
  async getParentVmid(templateId: string): Promise<number | null> {
    const template = await this.getTemplate(templateId);
    if (!template?.parentTemplateId) return null;

    const parent = await this.getTemplate(template.parentTemplateId);
    return parent?.vmid || null;
  }

  /**
   * Create a new template record (pre-provisioning)
   */
  async createTemplate(
    userId: string,
    input: CreateTemplateInput
  ): Promise<ProxmoxTemplate> {
    let inheritedTechStacks: string[] = [];

    // Validate parent template if specified
    if (input.parentTemplateId) {
      const parent = await this.validateParentTemplate(input.parentTemplateId, userId);
      // Capture inherited tech stacks from parent (including its inherited stacks)
      inheritedTechStacks = this.getEffectiveTechStacks(parent);
    }

    // Filter new tech stacks to exclude already inherited ones
    const newTechStacks = (input.techStacks || []).filter(
      (stack) => !inheritedTechStacks.includes(stack)
    );

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
        parentTemplateId: input.parentTemplateId || null,
        name: input.name,
        description: input.description || null,
        techStacks: newTechStacks,
        inheritedTechStacks: inheritedTechStacks,
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
    errorMessage?: string,
    stagingContainerIp?: string | null
  ): Promise<void> {
    await db
      .update(proxmoxTemplates)
      .set({
        status,
        vmid: vmid ?? undefined,
        node: node ?? undefined,
        storage: storage ?? undefined,
        errorMessage: errorMessage ?? null,
        stagingContainerIp: stagingContainerIp ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(proxmoxTemplates.id, templateId));
  }

  /**
   * Clear staging state when finalizing a template
   */
  async clearStagingState(templateId: string): Promise<void> {
    await db
      .update(proxmoxTemplates)
      .set({
        stagingContainerIp: null,
        updatedAt: new Date(),
      })
      .where(eq(proxmoxTemplates.id, templateId));
  }

  /**
   * Delete a template
   * Resets all repositories using this template to the default template
   * Fails if child templates exist
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Check for child templates that depend on this one
    const childTemplates = await db
      .select()
      .from(proxmoxTemplates)
      .where(eq(proxmoxTemplates.parentTemplateId, templateId));

    if (childTemplates.length > 0) {
      const childNames = childTemplates.map((t) => t.name).join(', ');
      throw new Error(
        `Cannot delete template: ${childTemplates.length} template(s) are based on this template (${childNames})`
      );
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

    // Clear templateId on all workspaces using this template
    // (workspaces store templateId as a snapshot of which template was used to create them)
    await db
      .update(workspaces)
      .set({
        templateId: null,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.templateId, templateId));

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
   * Checks both the database AND Proxmox to ensure the VMID is truly available
   */
  async allocateTemplateVmid(): Promise<number> {
    const settingsService = getSettingsService();
    const config = await settingsService.getVmidConfig();

    // Get all VMIDs currently in use in Proxmox
    let proxmoxVmids = new Set<number>();
    try {
      const client = await getProxmoxClientAsync();
      const containers = await client.getLxcContainers();
      proxmoxVmids = new Set(containers.map(c => c.vmid));
    } catch (error) {
      console.warn('Could not fetch Proxmox containers, falling back to database-only check:', error);
    }

    // Also get VMIDs from our database (in case Proxmox check failed or there's a race condition)
    const dbTemplates = await db
      .select({ vmid: proxmoxTemplates.vmid })
      .from(proxmoxTemplates);

    const dbVmids = new Set(
      dbTemplates
        .filter(t => t.vmid !== null)
        .map(t => t.vmid as number)
    );

    // Combine both sets
    const usedVmids = new Set([...proxmoxVmids, ...dbVmids]);

    // Find the next available VMID starting from the configured starting point
    const maxVmid = config.maxVmid || config.startingVmid + 1000; // Default max range
    for (let vmid = config.startingVmid; vmid <= maxVmid; vmid++) {
      if (!usedVmids.has(vmid)) {
        return vmid;
      }
    }

    throw new Error(
      `No available VMIDs in range ${config.startingVmid}-${maxVmid}. All VMIDs are in use.`
    );
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

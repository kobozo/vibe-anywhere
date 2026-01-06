import { eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tabTemplates, type TabTemplate, type NewTabTemplate } from '@/lib/db/schema';

// Default templates that will be created for new users
// AI assistants are filtered by their requiredTechStack - only shown if that stack is in the workspace
export const DEFAULT_TEMPLATES: Omit<NewTabTemplate, 'userId'>[] = [
  {
    name: 'Claude',
    icon: 'claude',
    command: 'claude',
    args: [],
    description: 'Anthropic AI coding assistant',
    exitOnClose: true,
    sortOrder: 0,
    isBuiltIn: true,
    requiredTechStack: 'claude',
  },
  {
    name: 'Gemini',
    icon: 'gemini',
    command: 'gemini',
    args: [],
    description: 'Google AI assistant',
    exitOnClose: true,
    sortOrder: 1,
    isBuiltIn: true,
    requiredTechStack: 'gemini',
  },
  {
    name: 'Codex',
    icon: 'codex',
    command: 'codex',
    args: [],
    description: 'OpenAI coding assistant',
    exitOnClose: true,
    sortOrder: 2,
    isBuiltIn: true,
    requiredTechStack: 'codex',
  },
  {
    name: 'Copilot',
    icon: 'copilot',
    command: 'gh copilot',
    args: [],
    description: 'GitHub AI pair programmer',
    exitOnClose: true,
    sortOrder: 3,
    isBuiltIn: true,
    requiredTechStack: 'copilot',
  },
  {
    name: 'Mistral Vibe',
    icon: 'mistral',
    command: 'vibe',
    args: [],
    description: 'Mistral AI coding agent',
    exitOnClose: true,
    sortOrder: 4,
    isBuiltIn: true,
    requiredTechStack: 'mistral',
  },
  {
    name: 'Cody',
    icon: 'cody',
    command: 'cody',
    args: [],
    description: 'Sourcegraph AI code assistant',
    exitOnClose: true,
    sortOrder: 5,
    isBuiltIn: true,
    requiredTechStack: 'cody',
  },
  {
    name: 'OpenCode',
    icon: 'opencode',
    command: 'opencode',
    args: [],
    description: 'Open-source AI coding agent',
    exitOnClose: true,
    sortOrder: 6,
    isBuiltIn: true,
    requiredTechStack: 'opencode',
  },
  {
    name: 'Terminal',
    icon: 'terminal',
    command: '/bin/bash',
    args: [],
    description: 'Free terminal session',
    exitOnClose: false,
    sortOrder: 99, // Always at the end
    isBuiltIn: true,
    requiredTechStack: null, // Always shown
  },
];

export class TabTemplateService {
  /**
   * Get all templates for a user, creating defaults if none exist
   * and syncing any missing built-in templates
   */
  async getTemplates(userId: string): Promise<TabTemplate[]> {
    let templates = await db
      .select()
      .from(tabTemplates)
      .where(eq(tabTemplates.userId, userId))
      .orderBy(asc(tabTemplates.sortOrder));

    // If no templates exist, create all defaults
    if (templates.length === 0) {
      templates = await this.createDefaultTemplates(userId);
    } else {
      // Sync any missing built-in templates (for existing users after updates)
      const syncResult = await this.syncMissingBuiltInTemplates(userId, templates);
      if (syncResult.created.length > 0 || syncResult.updatedIds.size > 0) {
        // Re-fetch to get the accurate state after sync
        templates = await db
          .select()
          .from(tabTemplates)
          .where(eq(tabTemplates.userId, userId))
          .orderBy(asc(tabTemplates.sortOrder));
      }
    }

    return templates;
  }

  /**
   * Add any missing built-in templates and update existing ones for existing users
   * This ensures users get new built-in templates after software updates
   */
  async syncMissingBuiltInTemplates(
    userId: string,
    existingTemplates: TabTemplate[]
  ): Promise<{ created: TabTemplate[]; updatedIds: Set<string> }> {
    // Map existing templates by command (the stable identifier)
    const existingByCommand = new Map(
      existingTemplates.filter((t) => t.isBuiltIn).map((t) => [t.command, t])
    );

    const missingTemplates: Omit<NewTabTemplate, 'userId'>[] = [];
    const updatedIds = new Set<string>();

    for (const defaultTemplate of DEFAULT_TEMPLATES) {
      if (!defaultTemplate.isBuiltIn) continue;

      const existing = existingByCommand.get(defaultTemplate.command);
      if (!existing) {
        // Template doesn't exist - will create it
        missingTemplates.push(defaultTemplate);
      } else {
        // Template exists - update icon and requiredTechStack if different
        const needsUpdate =
          existing.icon !== defaultTemplate.icon ||
          existing.requiredTechStack !== defaultTemplate.requiredTechStack;

        if (needsUpdate) {
          await db
            .update(tabTemplates)
            .set({
              icon: defaultTemplate.icon,
              requiredTechStack: defaultTemplate.requiredTechStack,
              updatedAt: new Date(),
            })
            .where(eq(tabTemplates.id, existing.id));
          updatedIds.add(existing.id);
        }
      }
    }

    // Insert missing templates
    let created: TabTemplate[] = [];
    if (missingTemplates.length > 0) {
      const templateData = missingTemplates.map((t) => ({
        ...t,
        userId,
      }));
      created = await db.insert(tabTemplates).values(templateData).returning();
    }

    return { created, updatedIds };
  }

  /**
   * Create default templates for a user
   */
  async createDefaultTemplates(userId: string): Promise<TabTemplate[]> {
    const templateData = DEFAULT_TEMPLATES.map((t) => ({
      ...t,
      userId,
    }));

    return db.insert(tabTemplates).values(templateData).returning();
  }

  /**
   * Get a single template by ID
   */
  async getTemplate(templateId: string): Promise<TabTemplate | null> {
    const [template] = await db
      .select()
      .from(tabTemplates)
      .where(eq(tabTemplates.id, templateId));
    return template || null;
  }

  /**
   * Create a new template
   */
  async createTemplate(
    userId: string,
    input: {
      name: string;
      icon?: string;
      command: string;
      args?: string[];
      description?: string;
      exitOnClose?: boolean;
      requiredTechStack?: string | null;
    }
  ): Promise<TabTemplate> {
    // Get max sort order
    const templates = await this.getTemplates(userId);
    const maxSortOrder = Math.max(...templates.map((t) => t.sortOrder), -1);

    const [template] = await db
      .insert(tabTemplates)
      .values({
        userId,
        name: input.name,
        icon: input.icon || 'terminal',
        command: input.command,
        args: input.args || [],
        description: input.description,
        exitOnClose: input.exitOnClose ?? true, // Default to true for new templates
        sortOrder: maxSortOrder + 1,
        isBuiltIn: false,
        requiredTechStack: input.requiredTechStack ?? null,
      })
      .returning();

    return template;
  }

  /**
   * Update a template
   */
  async updateTemplate(
    templateId: string,
    updates: Partial<{
      name: string;
      icon: string;
      command: string;
      args: string[];
      description: string;
      sortOrder: number;
      requiredTechStack: string | null;
    }>
  ): Promise<TabTemplate> {
    const [template] = await db
      .update(tabTemplates)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tabTemplates.id, templateId))
      .returning();

    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    return template;
  }

  /**
   * Delete a template (only non-builtin)
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    if (template.isBuiltIn) {
      throw new Error('Cannot delete built-in templates');
    }

    await db.delete(tabTemplates).where(eq(tabTemplates.id, templateId));
  }

  /**
   * Reset templates to defaults (delete custom, recreate built-in)
   */
  async resetToDefaults(userId: string): Promise<TabTemplate[]> {
    // Delete all templates for user
    await db.delete(tabTemplates).where(eq(tabTemplates.userId, userId));

    // Recreate defaults
    return this.createDefaultTemplates(userId);
  }
}

// Singleton instance
let tabTemplateServiceInstance: TabTemplateService | null = null;

export function getTabTemplateService(): TabTemplateService {
  if (!tabTemplateServiceInstance) {
    tabTemplateServiceInstance = new TabTemplateService();
  }
  return tabTemplateServiceInstance;
}

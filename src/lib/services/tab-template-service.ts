import { eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tabTemplates, type TabTemplate, type NewTabTemplate } from '@/lib/db/schema';

// Default templates that will be created for new users
export const DEFAULT_TEMPLATES: Omit<NewTabTemplate, 'userId'>[] = [
  {
    name: 'Claude',
    icon: 'bot',
    command: 'claude',
    args: [],
    description: 'Claude Code AI assistant',
    exitOnClose: true, // Exit when Claude exits
    sortOrder: 0,
    isBuiltIn: true,
  },
  {
    name: 'Terminal',
    icon: 'terminal',
    command: '/bin/bash',
    args: [],
    description: 'Free terminal session',
    exitOnClose: false, // Terminal stays open
    sortOrder: 1,
    isBuiltIn: true,
  },
];

export class TabTemplateService {
  /**
   * Get all templates for a user, creating defaults if none exist
   */
  async getTemplates(userId: string): Promise<TabTemplate[]> {
    let templates = await db
      .select()
      .from(tabTemplates)
      .where(eq(tabTemplates.userId, userId))
      .orderBy(asc(tabTemplates.sortOrder));

    // If no templates exist, create defaults
    if (templates.length === 0) {
      templates = await this.createDefaultTemplates(userId);
    }

    return templates;
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
    input: { name: string; icon?: string; command: string; args?: string[]; description?: string; exitOnClose?: boolean }
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

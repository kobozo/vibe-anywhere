import { eq, desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tabs, type Tab, type NewTab, type SessionStatus } from '@/lib/db/schema';
import { getWorkspaceService, WorkspaceService } from './workspace-service';
import { config } from '@/lib/config';

export interface CreateTabInput {
  name: string;
  command?: string[];
  autoShutdownMinutes?: number;
}

export interface TabInfo {
  id: string;
  workspaceId: string;
  name: string;
  status: SessionStatus;
  command: string[];
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
}

export class TabService {
  private workspaceService: WorkspaceService;

  constructor() {
    this.workspaceService = getWorkspaceService();
  }

  /**
   * Create a new tab in a workspace
   */
  async createTab(workspaceId: string, input: CreateTabInput): Promise<Tab> {
    // Verify workspace exists
    const workspace = await this.workspaceService.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Create the tab record
    const [tab] = await db
      .insert(tabs)
      .values({
        workspaceId,
        name: input.name,
        command: input.command || ['/bin/bash'],
        status: 'pending',
        outputBuffer: [],
        outputBufferSize: config.session.outputBufferSize,
        autoShutdownMinutes: input.autoShutdownMinutes || null,
      })
      .returning();

    return tab;
  }

  /**
   * Start a tab (ensure workspace container is running)
   * The actual exec happens when attaching via WebSocket
   */
  async startTab(tabId: string): Promise<Tab> {
    const tab = await this.getTab(tabId);
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }

    // Check if tab can be started
    if (tab.status !== 'pending' && tab.status !== 'stopped' && tab.status !== 'error') {
      throw new Error(`Tab cannot be started from ${tab.status} state`);
    }

    // Get workspace
    const workspace = await this.workspaceService.getWorkspace(tab.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${tab.workspaceId} not found`);
    }

    // Ensure workspace container is running
    await this.workspaceService.startContainer(workspace.id);

    // Mark tab as running
    const [updatedTab] = await db
      .update(tabs)
      .set({
        status: 'running',
        updatedAt: new Date(),
        lastActivityAt: new Date(),
      })
      .where(eq(tabs.id, tabId))
      .returning();

    // Update workspace activity
    await this.workspaceService.touch(workspace.id);

    return updatedTab;
  }

  /**
   * Stop a tab (mark as stopped - doesn't stop container since it's shared)
   */
  async stopTab(tabId: string): Promise<Tab> {
    const tab = await this.getTab(tabId);
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }

    // Update tab status
    const [updatedTab] = await db
      .update(tabs)
      .set({
        status: 'stopped',
        updatedAt: new Date(),
      })
      .where(eq(tabs.id, tabId))
      .returning();

    return updatedTab;
  }

  /**
   * Delete a tab
   */
  async deleteTab(tabId: string): Promise<void> {
    const tab = await this.getTab(tabId);
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }

    // Delete tab from database
    await db.delete(tabs).where(eq(tabs.id, tabId));
  }

  /**
   * Get a tab by ID
   */
  async getTab(tabId: string): Promise<Tab | null> {
    const [tab] = await db.select().from(tabs).where(eq(tabs.id, tabId));
    return tab || null;
  }

  /**
   * List tabs for a workspace
   */
  async listTabs(workspaceId: string): Promise<Tab[]> {
    return db
      .select()
      .from(tabs)
      .where(eq(tabs.workspaceId, workspaceId))
      .orderBy(desc(tabs.createdAt));
  }

  /**
   * Update tab fields
   */
  async updateTab(
    tabId: string,
    updates: Partial<Pick<Tab, 'status' | 'outputBuffer'>>
  ): Promise<Tab> {
    const [updated] = await db
      .update(tabs)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tabs.id, tabId))
      .returning();

    if (!updated) {
      throw new Error(`Tab ${tabId} not found or update failed`);
    }

    return updated;
  }

  /**
   * Append output to tab buffer
   * Uses atomic SQL operations to avoid race conditions
   */
  async appendOutput(tabId: string, data: string): Promise<void> {
    await db.execute(
      sql`
        UPDATE tabs
        SET
          output_buffer = (
            SELECT jsonb_agg(elem)
            FROM (
              SELECT elem
              FROM jsonb_array_elements(COALESCE(output_buffer, '[]'::jsonb) || ${JSON.stringify([data])}::jsonb) AS elem
              ORDER BY (row_number() OVER ()) DESC
              LIMIT output_buffer_size
            ) sub
            ORDER BY (row_number() OVER ())
          ),
          last_activity_at = NOW()
        WHERE id = ${tabId}
      `
    );
  }

  /**
   * Get output buffer for reconnection
   */
  async getOutputBuffer(tabId: string): Promise<string[]> {
    const tab = await this.getTab(tabId);
    return tab?.outputBuffer || [];
  }

  /**
   * Convert tab to public info
   */
  toTabInfo(tab: Tab): TabInfo {
    return {
      id: tab.id,
      workspaceId: tab.workspaceId,
      name: tab.name,
      status: tab.status,
      command: tab.command || ['/bin/bash'],
      createdAt: tab.createdAt,
      updatedAt: tab.updatedAt,
      lastActivityAt: tab.lastActivityAt,
    };
  }
}

// Singleton instance
let tabServiceInstance: TabService | null = null;

export function getTabService(): TabService {
  if (!tabServiceInstance) {
    tabServiceInstance = new TabService();
  }
  return tabServiceInstance;
}

import { eq, desc, asc, and, inArray, ne , sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tabs, tabGroups, type Tab, type NewTab, type SessionStatus, type TabType } from '@/lib/db/schema';
import { getWorkspaceService, WorkspaceService } from './workspace-service';
import { config } from '@/lib/config';

export interface CreateTabInput {
  name: string;
  command?: string[];
  exitOnClose?: boolean;
  autoShutdownMinutes?: number;
  tabType?: TabType;
  icon?: string;
  isPinned?: boolean;
  sortOrder?: number;
}

export interface TabInfo {
  id: string;
  workspaceId: string;
  name: string;
  status: SessionStatus;
  tabType: TabType;
  icon: string | null;
  isPinned: boolean;
  sortOrder: number;
  command: string[];
  exitOnClose: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
}

export class TabService {
  private workspaceServiceInstance: WorkspaceService | null = null;

  /**
   * Get workspace service (lazy initialization)
   */
  private async getWorkspace(): Promise<WorkspaceService> {
    if (!this.workspaceServiceInstance) {
      this.workspaceServiceInstance = await getWorkspaceService();
    }
    return this.workspaceServiceInstance;
  }

  /**
   * Create a new tab in a workspace
   * Tab is automatically set to 'running' if the workspace container is running
   */
  async createTab(workspaceId: string, input: CreateTabInput): Promise<Tab> {
    // Verify workspace exists and get container status
    const workspaceService = await this.getWorkspace();
    const workspace = await workspaceService.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Set status based on container state
    // If container is running, tab is immediately ready to attach
    const status = workspace.containerStatus === 'running' ? 'running' : 'pending';

    // Create the tab record
    const [tab] = await db
      .insert(tabs)
      .values({
        workspaceId,
        name: input.name,
        command: input.command || ['/bin/bash'],
        exitOnClose: input.exitOnClose ?? false,
        status,
        tabType: input.tabType || 'terminal',
        icon: input.icon || null,
        isPinned: input.isPinned || false,
        sortOrder: input.sortOrder ?? 0,
        outputBufferSize: config.session.outputBufferSize,
        autoShutdownMinutes: input.autoShutdownMinutes || null,
      })
      .returning();

    // Update workspace activity
    if (status === 'running') {
      await workspaceService.touch(workspaceId);
    }

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
    const workspaceService = await this.getWorkspace();
    const workspace = await workspaceService.getWorkspace(tab.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${tab.workspaceId} not found`);
    }

    // Ensure workspace container is running
    await workspaceService.startContainer(workspace.id);

    // Mark tab as running
    const [updatedTab] = await db
      .update(tabs)
      .set({
        status: 'running',
        updatedAt: sql`NOW()`,
        lastActivityAt: sql`NOW()`,
      })
      .where(eq(tabs.id, tabId))
      .returning();

    // Update workspace activity
    await workspaceService.touch(workspace.id);

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
        updatedAt: sql`NOW()`,
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
   * List tabs for a workspace (sorted by sortOrder first, then creation date)
   */
  async listTabs(workspaceId: string): Promise<Tab[]> {
    return db
      .select()
      .from(tabs)
      .where(eq(tabs.workspaceId, workspaceId))
      .orderBy(asc(tabs.sortOrder), asc(tabs.createdAt));
  }

  /**
   * Ensure a Git tab exists for the workspace
   * Creates one if it doesn't exist, returns existing if it does
   */
  async ensureGitTab(workspaceId: string): Promise<Tab> {
    // Check if git tab already exists
    const existingTabs = await this.listTabs(workspaceId);
    const gitTab = existingTabs.find(t => t.tabType === 'git');

    if (gitTab) {
      return gitTab;
    }

    // Get workspace to check container status
    const workspaceService = await this.getWorkspace();
    const workspace = await workspaceService.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Create git tab - it's always running since it doesn't need a terminal session
    const [tab] = await db
      .insert(tabs)
      .values({
        workspaceId,
        name: 'Git',
        command: [], // Git tabs don't run commands
        status: 'running', // Git tabs are always "running" since they just display UI
        tabType: 'git',
        isPinned: false, // Can be closed and re-added via + button
        sortOrder: -100, // Always first
        outputBufferSize: 0,
      })
      .returning();

    return tab;
  }

  /**
   * Ensure a Docker tab exists for the workspace (only if Docker is in tech stack)
   * Creates one if it doesn't exist, returns existing if it does
   */
  async ensureDockerTab(workspaceId: string): Promise<Tab> {
    // Check if docker tab already exists
    const existingTabs = await this.listTabs(workspaceId);
    const dockerTab = existingTabs.find(t => t.tabType === 'docker');

    if (dockerTab) {
      return dockerTab;
    }

    // Get workspace to check container status
    const workspaceService = await this.getWorkspace();
    const workspace = await workspaceService.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Create docker tab - it's always running since it doesn't need a terminal session
    const [tab] = await db
      .insert(tabs)
      .values({
        workspaceId,
        name: 'Docker',
        command: [], // Docker tabs don't run commands
        status: 'running', // Docker tabs are always "running" since they just display UI
        tabType: 'docker',
        isPinned: false, // Can be closed and re-added via + button
        sortOrder: -99, // After git tab (-100), before terminals
        outputBufferSize: 0,
      })
      .returning();

    return tab;
  }

  /**
   * Update tab fields
   */
  async updateTab(
    tabId: string,
    updates: Partial<Pick<Tab, 'status' | 'outputBuffer'>>
  ): Promise<Tab> {
    // Stringify outputBuffer if present
    const processedUpdates: any = { ...updates };
    if (updates.outputBuffer !== undefined) {
      processedUpdates.outputBuffer = JSON.stringify(updates.outputBuffer);
    }

    const [updated] = await db
      .update(tabs)
      .set({
        ...processedUpdates,
        updatedAt: sql`NOW()`,
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
    if (!tab?.outputBuffer) return [];

    return typeof tab.outputBuffer === 'string'
      ? JSON.parse(tab.outputBuffer)
      : ((tab.outputBuffer as string[]) || []);
  }

  /**
   * Convert tab to public info
   */
  toTabInfo(tab: Tab): TabInfo {
    const command = typeof tab.command === 'string'
      ? JSON.parse(tab.command)
      : (tab.command || ['/bin/bash']);

    const isPinned = !!tab.isPinned;
    const exitOnClose = !!tab.exitOnClose;

    console.log('[toTabInfo] Step by step:', {
      'tab.isPinned': tab.isPinned,
      '!!tab.isPinned': isPinned,
      'tab.command type': typeof tab.command,
      'tab.command': tab.command,
      'parsed command': command,
      'command is array': Array.isArray(command),
      'tab.exitOnClose': tab.exitOnClose,
      '!!tab.exitOnClose': exitOnClose,
    });

    return {
      id: tab.id,
      workspaceId: tab.workspaceId,
      name: tab.name,
      status: tab.status,
      tabType: tab.tabType,
      icon: tab.icon,
      isPinned,
      sortOrder: tab.sortOrder,
      command,
      exitOnClose,
      createdAt: new Date(tab.createdAt),
      updatedAt: new Date(tab.updatedAt),
      lastActivityAt: new Date(tab.lastActivityAt),
    };
  }

  /**
   * Batch update sortOrder for multiple tabs
   * Used for drag-and-drop reordering
   * Uses transaction for atomicity
   */
  async batchUpdateSortOrder(
    workspaceId: string,
    updates: Array<{ id: string; sortOrder: number }>
  ): Promise<void> {
    if (updates.length === 0) return;

    // Verify all tabs belong to workspace
    const tabIds = updates.map(u => u.id);
    const existingTabs = await db
      .select()
      .from(tabs)
      .where(and(
        eq(tabs.workspaceId, workspaceId),
        inArray(tabs.id, tabIds)
      ));

    if (existingTabs.length !== updates.length) {
      throw new Error('One or more tabs not found or do not belong to this workspace');
    }

    // Batch update using transaction for atomicity
    await db.transaction(async (tx) => {
      for (const { id, sortOrder } of updates) {
        await tx
          .update(tabs)
          .set({ sortOrder, updatedAt: sql`NOW()` })
          .where(eq(tabs.id, id));
      }
    });
  }

  /**
   * Delete all tabs except Dashboard for a workspace
   * Also deletes all tab groups (members cascade-deleted automatically)
   * Ensures Dashboard tab exists after cleanup
   * Used during redeploy/destroy operations
   */
  async deleteAllTabsExceptDashboard(workspaceId: string): Promise<Tab> {
    await db.transaction(async (tx) => {
      // 1. Delete all tab groups (CASCADE deletes tabGroupMembers)
      await tx.delete(tabGroups).where(eq(tabGroups.workspaceId, workspaceId));

      // 2. Delete all non-dashboard tabs
      await tx.delete(tabs).where(
        and(
          eq(tabs.workspaceId, workspaceId),
          ne(tabs.tabType, 'dashboard')
        )
      );
    });

    // 3. Ensure Dashboard tab exists (create if missing)
    const existingTabs = await this.listTabs(workspaceId);
    const dashboardTab = existingTabs.find(t => t.tabType === 'dashboard');

    if (dashboardTab) {
      return dashboardTab;
    }

    // Create Dashboard tab if it doesn't exist
    const [tab] = await db
      .insert(tabs)
      .values({
        workspaceId,
        name: 'Dashboard',
        command: [],
        status: 'running',
        tabType: 'dashboard',
        icon: 'dashboard',
        isPinned: false,
        sortOrder: -101,
        outputBufferSize: 0,
      })
      .returning();

    return tab;
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

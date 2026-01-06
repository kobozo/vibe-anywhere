import { eq, and, inArray, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  tabGroups,
  tabGroupMembers,
  tabs,
  type TabGroup,
  type NewTabGroup,
  type TabGroupMember,
  type TabGroupLayout,
  type Tab,
} from '@/lib/db/schema';
import { getTabService, type TabInfo } from './tab-service';

export interface TabGroupMemberInfo {
  id: string;
  groupId: string;
  tabId: string;
  paneIndex: number;
  sizePercent: number;
  createdAt: Date;
  tab: TabInfo;
}

export interface TabGroupInfo {
  id: string;
  workspaceId: string;
  name: string;
  layout: TabGroupLayout;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  members: TabGroupMemberInfo[];
}

export interface CreateTabGroupInput {
  name: string;
  tabIds: string[];
  layout?: TabGroupLayout;
}

export interface UpdateTabGroupInput {
  name?: string;
  layout?: TabGroupLayout;
}

export interface UpdatePaneSizeInput {
  tabId: string;
  sizePercent: number;
}

export class TabGroupService {
  private tabService = getTabService();

  /**
   * Create a new tab group
   * Minimum 2 tabs required
   */
  async createGroup(workspaceId: string, input: CreateTabGroupInput): Promise<TabGroupInfo> {
    if (input.tabIds.length < 2) {
      throw new Error('Tab groups require at least 2 tabs');
    }

    if (input.tabIds.length > 4) {
      throw new Error('Tab groups support a maximum of 4 tabs');
    }

    // Verify all tabs exist and belong to this workspace
    const tabsList = await db
      .select()
      .from(tabs)
      .where(and(
        eq(tabs.workspaceId, workspaceId),
        inArray(tabs.id, input.tabIds)
      ));

    if (tabsList.length !== input.tabIds.length) {
      throw new Error('One or more tabs not found or do not belong to this workspace');
    }

    // Check if any tabs are already in a group
    const existingMemberships = await db
      .select()
      .from(tabGroupMembers)
      .where(inArray(tabGroupMembers.tabId, input.tabIds));

    if (existingMemberships.length > 0) {
      throw new Error('One or more tabs are already in a group');
    }

    // Determine layout based on tab count if not specified
    const layout = input.layout || this.suggestLayout(input.tabIds.length);

    // Create the group
    const [group] = await db
      .insert(tabGroups)
      .values({
        workspaceId,
        name: input.name,
        layout,
        sortOrder: 0,
      })
      .returning();

    // Calculate initial pane sizes (equal distribution)
    const sizePercent = Math.floor(100 / input.tabIds.length);

    // Create member records
    const memberRecords = input.tabIds.map((tabId, index) => ({
      groupId: group.id,
      tabId,
      paneIndex: index,
      sizePercent: index === input.tabIds.length - 1
        ? 100 - (sizePercent * (input.tabIds.length - 1)) // Last pane gets remainder
        : sizePercent,
    }));

    await db.insert(tabGroupMembers).values(memberRecords);

    // Return full group info
    return this.getGroup(group.id) as Promise<TabGroupInfo>;
  }

  /**
   * Get a tab group by ID with all members
   */
  async getGroup(groupId: string): Promise<TabGroupInfo | null> {
    const [group] = await db
      .select()
      .from(tabGroups)
      .where(eq(tabGroups.id, groupId));

    if (!group) {
      return null;
    }

    return this.buildGroupInfo(group);
  }

  /**
   * List all tab groups for a workspace
   */
  async listGroups(workspaceId: string): Promise<TabGroupInfo[]> {
    const groups = await db
      .select()
      .from(tabGroups)
      .where(eq(tabGroups.workspaceId, workspaceId))
      .orderBy(asc(tabGroups.sortOrder), asc(tabGroups.createdAt));

    return Promise.all(groups.map(g => this.buildGroupInfo(g)));
  }

  /**
   * Update a tab group
   */
  async updateGroup(groupId: string, input: UpdateTabGroupInput): Promise<TabGroupInfo> {
    const [updated] = await db
      .update(tabGroups)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(tabGroups.id, groupId))
      .returning();

    if (!updated) {
      throw new Error(`Tab group ${groupId} not found`);
    }

    return this.getGroup(groupId) as Promise<TabGroupInfo>;
  }

  /**
   * Delete a tab group (tabs are preserved)
   */
  async deleteGroup(groupId: string): Promise<void> {
    const group = await this.getGroup(groupId);
    if (!group) {
      throw new Error(`Tab group ${groupId} not found`);
    }

    // Members are cascade deleted
    await db.delete(tabGroups).where(eq(tabGroups.id, groupId));
  }

  /**
   * Update pane sizes for a group
   */
  async updatePaneSizes(groupId: string, sizes: UpdatePaneSizeInput[]): Promise<TabGroupInfo> {
    const group = await this.getGroup(groupId);
    if (!group) {
      throw new Error(`Tab group ${groupId} not found`);
    }

    // Update each member's size
    for (const { tabId, sizePercent } of sizes) {
      await db
        .update(tabGroupMembers)
        .set({ sizePercent })
        .where(and(
          eq(tabGroupMembers.groupId, groupId),
          eq(tabGroupMembers.tabId, tabId)
        ));
    }

    // Update group timestamp
    await db
      .update(tabGroups)
      .set({ updatedAt: new Date() })
      .where(eq(tabGroups.id, groupId));

    return this.getGroup(groupId) as Promise<TabGroupInfo>;
  }

  /**
   * Add a tab to an existing group
   */
  async addTabToGroup(groupId: string, tabId: string): Promise<TabGroupInfo> {
    const group = await this.getGroup(groupId);
    if (!group) {
      throw new Error(`Tab group ${groupId} not found`);
    }

    if (group.members.length >= 4) {
      throw new Error('Tab group already has maximum of 4 tabs');
    }

    // Check if tab exists and belongs to same workspace
    const tab = await this.tabService.getTab(tabId);
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    if (tab.workspaceId !== group.workspaceId) {
      throw new Error('Tab does not belong to the same workspace');
    }

    // Check if tab is already in a group
    const [existing] = await db
      .select()
      .from(tabGroupMembers)
      .where(eq(tabGroupMembers.tabId, tabId));

    if (existing) {
      throw new Error('Tab is already in a group');
    }

    // Add the tab
    const nextIndex = Math.max(...group.members.map(m => m.paneIndex)) + 1;
    await db.insert(tabGroupMembers).values({
      groupId,
      tabId,
      paneIndex: nextIndex,
      sizePercent: 25, // Will need rebalancing
    });

    // Rebalance sizes
    await this.rebalancePaneSizes(groupId);

    return this.getGroup(groupId) as Promise<TabGroupInfo>;
  }

  /**
   * Remove a tab from a group
   * If less than 2 tabs remain, the group is automatically disbanded
   */
  async removeTabFromGroup(groupId: string, tabId: string): Promise<TabGroupInfo | null> {
    const group = await this.getGroup(groupId);
    if (!group) {
      throw new Error(`Tab group ${groupId} not found`);
    }

    // Remove the member
    await db
      .delete(tabGroupMembers)
      .where(and(
        eq(tabGroupMembers.groupId, groupId),
        eq(tabGroupMembers.tabId, tabId)
      ));

    // Check remaining members
    const remainingMembers = await db
      .select()
      .from(tabGroupMembers)
      .where(eq(tabGroupMembers.groupId, groupId));

    if (remainingMembers.length < 2) {
      // Disband the group
      await this.deleteGroup(groupId);
      return null;
    }

    // Rebalance sizes
    await this.rebalancePaneSizes(groupId);

    return this.getGroup(groupId);
  }

  /**
   * Handle tab deletion - remove from group and possibly disband
   */
  async handleTabDeleted(tabId: string): Promise<void> {
    // Find which group this tab belongs to
    const [membership] = await db
      .select()
      .from(tabGroupMembers)
      .where(eq(tabGroupMembers.tabId, tabId));

    if (membership) {
      // The cascade delete will remove the member
      // Check if group needs to be disbanded
      const remainingMembers = await db
        .select()
        .from(tabGroupMembers)
        .where(and(
          eq(tabGroupMembers.groupId, membership.groupId),
          // Don't count the one being deleted (cascade may not have run yet)
        ));

      // Note: CASCADE DELETE handles membership removal
      // We just need to check if group should be disbanded after
      if (remainingMembers.length <= 2) { // <= 2 because one is being deleted
        // Will be disbanded by cascade or we disband here
        const [group] = await db
          .select()
          .from(tabGroups)
          .where(eq(tabGroups.id, membership.groupId));

        if (group) {
          await this.deleteGroup(group.id);
        }
      }
    }
  }

  /**
   * Check if a tab is in any group
   */
  async isTabInGroup(tabId: string): Promise<string | null> {
    const [membership] = await db
      .select()
      .from(tabGroupMembers)
      .where(eq(tabGroupMembers.tabId, tabId));

    return membership?.groupId || null;
  }

  /**
   * Get the group containing a specific tab
   */
  async getGroupForTab(tabId: string): Promise<TabGroupInfo | null> {
    const groupId = await this.isTabInGroup(tabId);
    if (!groupId) return null;
    return this.getGroup(groupId);
  }

  /**
   * Suggest a layout based on tab count
   */
  private suggestLayout(tabCount: number): TabGroupLayout {
    switch (tabCount) {
      case 2:
        return 'horizontal';
      case 3:
        return 'left-stack';
      case 4:
        return 'grid-2x2';
      default:
        return 'horizontal';
    }
  }

  /**
   * Rebalance pane sizes equally
   */
  private async rebalancePaneSizes(groupId: string): Promise<void> {
    const members = await db
      .select()
      .from(tabGroupMembers)
      .where(eq(tabGroupMembers.groupId, groupId))
      .orderBy(asc(tabGroupMembers.paneIndex));

    const sizePercent = Math.floor(100 / members.length);

    for (let i = 0; i < members.length; i++) {
      const size = i === members.length - 1
        ? 100 - (sizePercent * (members.length - 1))
        : sizePercent;

      await db
        .update(tabGroupMembers)
        .set({
          sizePercent: size,
          paneIndex: i // Re-index
        })
        .where(eq(tabGroupMembers.id, members[i].id));
    }
  }

  /**
   * Build full group info with members and their tabs
   */
  private async buildGroupInfo(group: TabGroup): Promise<TabGroupInfo> {
    const members = await db
      .select()
      .from(tabGroupMembers)
      .where(eq(tabGroupMembers.groupId, group.id))
      .orderBy(asc(tabGroupMembers.paneIndex));

    // Fetch tab info for each member
    const memberInfos: TabGroupMemberInfo[] = await Promise.all(
      members.map(async (member) => {
        const tab = await this.tabService.getTab(member.tabId);
        return {
          id: member.id,
          groupId: member.groupId,
          tabId: member.tabId,
          paneIndex: member.paneIndex,
          sizePercent: member.sizePercent,
          createdAt: member.createdAt,
          tab: tab ? this.tabService.toTabInfo(tab) : null as unknown as TabInfo,
        };
      })
    );

    return {
      id: group.id,
      workspaceId: group.workspaceId,
      name: group.name,
      layout: group.layout,
      sortOrder: group.sortOrder,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      members: memberInfos.filter(m => m.tab !== null),
    };
  }
}

// Singleton instance
let tabGroupServiceInstance: TabGroupService | null = null;

export function getTabGroupService(): TabGroupService {
  if (!tabGroupServiceInstance) {
    tabGroupServiceInstance = new TabGroupService();
  }
  return tabGroupServiceInstance;
}

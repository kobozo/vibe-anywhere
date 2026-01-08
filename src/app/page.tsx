'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuthState, AuthProvider, useAuth } from '@/hooks/useAuth';
import { useRepositories } from '@/hooks/useRepositories';
import { useWorkspaceState, WorkspaceStateUpdate } from '@/hooks/useWorkspaceState';
import { useTemplates, type ProvisionProgress } from '@/hooks/useTemplates';
import { useTabGroups } from '@/hooks/useTabGroups';
import { useTabTemplates } from '@/hooks/useTabTemplates';
import { RepositoryTree } from '@/components/repositories/repository-tree';
import { AddRepositoryDialog } from '@/components/repositories/add-repository-dialog';
import { EditRepositoryDialog } from '@/components/repositories/edit-repository-dialog';
import { CreateWorkspaceDialog } from '@/components/workspaces/create-workspace-dialog';
import { TabBar, TabBarRef } from '@/components/tabs/tab-bar';
import { useOpenAISettings } from '@/hooks/useOpenAISettings';
import { useProxmoxSettings } from '@/hooks/useProxmoxSettings';
import { useSocket } from '@/hooks/useSocket';
import { useUIState } from '@/hooks/useUIState';
import { LoginForm } from '@/components/auth/login-form';
import { SettingsModal } from '@/components/settings/settings-modal';
import { GitPanel } from '@/components/git';
import { DockerPanel } from '@/components/docker';
import { DashboardPanel } from '@/components/dashboard';
import { RepositoryDashboard } from '@/components/repositories/repository-dashboard';
import { TemplateSection, TemplateDialog, TemplateDetailsModal } from '@/components/templates';
import { StagingTerminalModal } from '@/components/templates/staging-terminal-modal';
import { SplitViewContainer, CreateGroupDialog } from '@/components/split-view';
import { TerminalContextMenu, type SplitDirection } from '@/components/terminal/terminal-context-menu';
import { WorkspaceContent, type ContainerOperation } from '@/components/workspace';
import type { Repository, Workspace, ProxmoxTemplate } from '@/lib/db/schema';
import type { TabInfo } from '@/hooks/useTabs';

// Dynamic import with SSR disabled - xterm.js uses browser-only APIs
const Terminal = dynamic(
  () => import('@/components/terminal/terminal').then(mod => ({ default: mod.Terminal })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-foreground-tertiary">
        Loading terminal...
      </div>
    )
  }
);

function Dashboard() {
  const { isAuthenticated, isLoading: authLoading, logout, user } = useAuth();
  const {
    repositories,
    isLoading: reposLoading,
    error: reposError,
    cloneRepository,
    deleteRepository,
    fetchRepositories,
  } = useRepositories();

  // Templates hook
  const {
    templates,
    isLoading: templatesLoading,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    finalizeTemplate,
    startProvisionInBackground,
    startRecreateInBackground,
    isTemplateProvisioning,
    provisionLogs,
  } = useTemplates();

  // Proxmox settings (for default CT template)
  const { settings: proxmoxSettings, fetchSettings: fetchProxmoxSettings } = useProxmoxSettings();

  // Fetch Proxmox settings on mount
  useEffect(() => {
    if (user) {
      fetchProxmoxSettings();
    }
  }, [user, fetchProxmoxSettings]);

  // Fetch repositories on mount
  useEffect(() => {
    if (user) {
      fetchRepositories();
    }
  }, [user, fetchRepositories]);

  // Selection state
  const [selectedRepository, setSelectedRepository] = useState<Repository | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [selectedTab, setSelectedTab] = useState<TabInfo | null>(null);
  const [workspaceTechStacks, setWorkspaceTechStacks] = useState<string[]>([]);

  // Container operation state - tracks if deploy/redeploy is in progress
  const [activeOperation, setActiveOperation] = useState<ContainerOperation>(null);

  // Dialog state
  const [isAddRepoOpen, setIsAddRepoOpen] = useState(false);
  const [isAddWorkspaceOpen, setIsAddWorkspaceOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [workspaceRepoId, setWorkspaceRepoId] = useState<string | null>(null);
  const [preselectedBranch, setPreselectedBranch] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit repository state
  const [editingRepository, setEditingRepository] = useState<Repository | null>(null);
  const [isEditRepoLoading, setIsEditRepoLoading] = useState(false);

  // Workspace refresh trigger (set after creating a workspace to refresh the sidebar)
  const [refreshWorkspacesForRepoId, setRefreshWorkspacesForRepoId] = useState<string | null>(null);

  // Template dialog state
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProxmoxTemplate | null>(null);
  const [cloningTemplate, setCloningTemplate] = useState<ProxmoxTemplate | null>(null); // Parent template for clone mode
  const [isTemplateDialogLoading, setIsTemplateDialogLoading] = useState(false);

  // Re-fetch Proxmox settings when template dialog opens (to get latest default CT template)
  useEffect(() => {
    if (isTemplateDialogOpen && user) {
      fetchProxmoxSettings();
    }
  }, [isTemplateDialogOpen, user, fetchProxmoxSettings]);

  // Template details modal state (for viewing status, errors, actions)
  const [selectedTemplate, setSelectedTemplate] = useState<ProxmoxTemplate | null>(null);
  // Track progress per template (keyed by template ID)
  const [templateProgress, setTemplateProgress] = useState<Map<string, ProvisionProgress>>(new Map());
  const [templateErrors, setTemplateErrors] = useState<Map<string, string>>(new Map());

  // Staging terminal modal state - store just the ID to always get fresh data from templates array
  const [stagingTemplateId, setStagingTemplateId] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Look up the actual template from templates array to ensure we have fresh data
  const stagingTemplate = stagingTemplateId ? templates.find(t => t.id === stagingTemplateId) || null : null;

  // Terminal state
  const [isTerminalConnected, setIsTerminalConnected] = useState(false);
  const deleteTabRef = useRef<((tabId: string) => Promise<void>) | null>(null);
  const workspaceTabsRef = useRef<TabInfo[]>([]);
  const tabBarRef = useRef<TabBarRef>(null);

  // Tab groups hook
  const {
    groups,
    activeGroupId,
    activeGroup,
    setActiveGroupId,
    multiSelectMode,
    selectedTabIds: selectedTabIdsForGroup,
    enterMultiSelectMode,
    exitMultiSelectMode,
    toggleTabSelection,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    closeGroup,
    updatePaneSizes,
    addTabToGroup,
    getGroupForTab,
    groupedTabIds,
    setGroups,
  } = useTabGroups(selectedWorkspace?.id || null);

  // Tab templates hook (for terminal context menu)
  const { templates: tabTemplates, fetchTemplates: fetchTabTemplates } = useTabTemplates();

  // Create group dialog state
  const [isCreateGroupDialogOpen, setIsCreateGroupDialogOpen] = useState(false);

  // Terminal context menu state
  const [terminalContextMenu, setTerminalContextMenu] = useState<{
    position: { x: number; y: number };
    tabId: string;
  } | null>(null);

  // Whisper/Voice state
  const { isConfigured: whisperEnabled, fetchSettings: fetchWhisperSettings } = useOpenAISettings();
  const { token } = useAuth();
  const { socket } = useSocket({ token });

  // UI state persistence (for preserving view across page refresh)
  const {
    expandedRepos: persistedExpandedRepos,
    selectedTabId: persistedSelectedTabId,
    activeGroupId: persistedActiveGroupId,
    selectedRepositoryId: persistedRepositoryId,
    selectedWorkspaceId: persistedWorkspaceId,
    isLoaded: uiStateLoaded,
    setExpandedRepos: persistExpandedRepos,
    setSelectedTabId: persistSelectedTabId,
    setActiveGroupId: persistActiveGroupId,
    setSelectedRepositoryId: persistSelectedRepositoryId,
    setSelectedWorkspaceId: persistSelectedWorkspaceId,
  } = useUIState();

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Fetch whisper settings on mount
  useEffect(() => {
    fetchWhisperSettings();
  }, [fetchWhisperSettings]);

  // Fetch tab templates on mount
  useEffect(() => {
    fetchTabTemplates();
  }, [fetchTabTemplates]);

  // Fetch tab groups when workspace changes
  useEffect(() => {
    if (selectedWorkspace?.id) {
      fetchGroups();
    }
  }, [selectedWorkspace?.id, fetchGroups]);

  // Persist selected tab ID when it changes
  useEffect(() => {
    if (uiStateLoaded) {
      persistSelectedTabId(selectedTab?.id || null);
    }
  }, [selectedTab?.id, uiStateLoaded, persistSelectedTabId]);

  // Persist active group ID when it changes
  useEffect(() => {
    if (uiStateLoaded) {
      persistActiveGroupId(activeGroupId);
    }
  }, [activeGroupId, uiStateLoaded, persistActiveGroupId]);

  // Persist selected repository ID when it changes
  useEffect(() => {
    if (uiStateLoaded) {
      persistSelectedRepositoryId(selectedRepository?.id || null);
    }
  }, [selectedRepository?.id, uiStateLoaded, persistSelectedRepositoryId]);

  // Persist selected workspace ID when it changes
  useEffect(() => {
    if (uiStateLoaded) {
      persistSelectedWorkspaceId(selectedWorkspace?.id || null);
    }
  }, [selectedWorkspace?.id, uiStateLoaded, persistSelectedWorkspaceId]);

  // Track if we've restored the tab selection (to only do it once)
  const [hasRestoredSelection, setHasRestoredSelection] = useState(false);

  // Track if we've restored the repository/workspace selection
  const [hasRestoredRepoSelection, setHasRestoredRepoSelection] = useState(false);

  // Callback from repository-tree when workspaces are loaded for a repo
  const [loadedWorkspacesForRepoId, setLoadedWorkspacesForRepoId] = useState<string | null>(null);
  const [loadedWorkspaces, setLoadedWorkspaces] = useState<Workspace[]>([]);

  // Restore repository selection after repositories are loaded
  useEffect(() => {
    if (
      !hasRestoredRepoSelection &&
      uiStateLoaded &&
      persistedRepositoryId &&
      repositories.length > 0
    ) {
      const repo = repositories.find(r => r.id === persistedRepositoryId);
      if (repo) {
        setSelectedRepository(repo);
        setHasRestoredRepoSelection(true);
      } else {
        // Repository was deleted
        setToastMessage('Repository no longer exists');
        persistSelectedRepositoryId(null);
        persistSelectedWorkspaceId(null);
        setHasRestoredRepoSelection(true);
      }
    }
  }, [
    hasRestoredRepoSelection,
    uiStateLoaded,
    persistedRepositoryId,
    repositories,
    persistSelectedRepositoryId,
    persistSelectedWorkspaceId,
  ]);

  // Restore workspace selection after workspaces are loaded for the selected repo
  useEffect(() => {
    if (
      hasRestoredRepoSelection &&
      uiStateLoaded &&
      persistedWorkspaceId &&
      loadedWorkspacesForRepoId === persistedRepositoryId &&
      loadedWorkspaces.length > 0
    ) {
      const workspace = loadedWorkspaces.find(w => w.id === persistedWorkspaceId);
      if (workspace) {
        setSelectedWorkspace(workspace);
      } else {
        // Workspace was deleted
        setToastMessage('Workspace no longer exists');
        persistSelectedWorkspaceId(null);
      }
      // Clear loaded workspaces tracking
      setLoadedWorkspacesForRepoId(null);
      setLoadedWorkspaces([]);
    }
  }, [
    hasRestoredRepoSelection,
    uiStateLoaded,
    persistedWorkspaceId,
    persistedRepositoryId,
    loadedWorkspacesForRepoId,
    loadedWorkspaces,
    persistSelectedWorkspaceId,
  ]);

  // Callback when workspaces are loaded in repository-tree
  const handleWorkspacesLoaded = useCallback((repoId: string, workspaces: Workspace[]) => {
    setLoadedWorkspacesForRepoId(repoId);
    setLoadedWorkspaces(workspaces);
  }, []);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Handle tabs change - store in ref and restore persisted selection
  const handleTabsChange = useCallback((tabs: TabInfo[]) => {
    workspaceTabsRef.current = tabs;

    // Restore persisted tab selection on first load
    if (!hasRestoredSelection && uiStateLoaded && tabs.length > 0) {
      // Try to restore persisted tab
      if (persistedSelectedTabId) {
        const persistedTab = tabs.find(t => t.id === persistedSelectedTabId);
        if (persistedTab) {
          setSelectedTab(persistedTab);
          setHasRestoredSelection(true);
          return;
        }
      }
      // Try to restore persisted group
      if (persistedActiveGroupId && groups.some(g => g.id === persistedActiveGroupId)) {
        setActiveGroupId(persistedActiveGroupId);
        setHasRestoredSelection(true);
        return;
      }
      // Mark as restored even if we couldn't find the persisted items
      setHasRestoredSelection(true);
    }
  }, [hasRestoredSelection, uiStateLoaded, persistedSelectedTabId, persistedActiveGroupId, groups, setActiveGroupId]);

  // Fetch workspace template tech stacks for tab filtering
  useEffect(() => {
    if (!selectedWorkspace?.id) {
      setWorkspaceTechStacks([]);
      return;
    }
    fetch(`/api/workspaces/${selectedWorkspace.id}/template`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.data?.template) {
          setWorkspaceTechStacks([
            ...(data.data.template.inheritedTechStacks || []),
            ...(data.data.template.techStacks || []),
          ]);
        }
      })
      .catch(() => setWorkspaceTechStacks([]));
  }, [selectedWorkspace?.id]);

  // Tab group handlers
  const handleCreateGroup = useCallback(async (name: string, tabIds: string[], layout: import('@/lib/db/schema').TabGroupLayout) => {
    await createGroup(name, tabIds, layout);
    setIsCreateGroupDialogOpen(false);
  }, [createGroup]);

  const handleUngroupTabs = useCallback(async (groupId: string) => {
    await deleteGroup(groupId);
  }, [deleteGroup]);

  const handleRenameGroup = useCallback(async (groupId: string, newName: string) => {
    await updateGroup(groupId, { name: newName });
  }, [updateGroup]);

  const handleCloseGroup = useCallback(async (groupId: string) => {
    if (!deleteTabRef.current) return;
    await closeGroup(groupId, deleteTabRef.current);
  }, [closeGroup]);

  const handlePaneResize = useCallback(async (sizes: { tabId: string; sizePercent: number }[]) => {
    if (activeGroupId) {
      await updatePaneSizes(activeGroupId, sizes);
    }
  }, [activeGroupId, updatePaneSizes]);

  // Terminal context menu handlers
  const handleTerminalContextMenu = useCallback(async (event: { x: number; y: number; tabId: string }) => {
    // Refresh groups before showing context menu to ensure we have fresh data
    await fetchGroups();
    setTerminalContextMenu({
      position: { x: event.x, y: event.y },
      tabId: event.tabId,
    });
  }, [fetchGroups]);

  // Handle split with existing tab
  const handleSplitWithExisting = useCallback(async (direction: SplitDirection, existingTabId: string, passedGroup: import('@/hooks/useTabGroups').TabGroupInfo | null) => {
    // Capture values at start to avoid closure issues
    const contextMenu = terminalContextMenu;
    if (!contextMenu || !selectedWorkspace) return;

    const currentTabId = contextMenu.tabId;
    const currentTab = workspaceTabsRef.current.find(t => t.id === currentTabId);
    if (!currentTab) {
      setTerminalContextMenu(null);
      return;
    }

    try {
      // Use the group passed from the context menu (most reliable)
      const currentGroup = passedGroup;

      if (currentGroup) {
        // Add to existing group
        await addTabToGroup(currentGroup.id, existingTabId);
        // Update layout based on new member count
        const newMemberCount = currentGroup.members.length + 1;
        let newLayout = currentGroup.layout;
        if (newMemberCount === 3) {
          newLayout = direction === 'left' || direction === 'right' ? 'left-stack' : 'right-stack';
        } else if (newMemberCount === 4) {
          newLayout = 'grid-2x2';
        }
        if (newLayout !== currentGroup.layout) {
          await updateGroup(currentGroup.id, { layout: newLayout });
        }
        await fetchGroups();
      } else {
        // Create new group
        const tabIds = direction === 'left' || direction === 'top'
          ? [existingTabId, currentTabId]
          : [currentTabId, existingTabId];
        const layout = direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
        const groupName = `Split ${currentTab.name}`;

        const newGroup = await createGroup(groupName, tabIds, layout);
        setActiveGroupId(newGroup.id);
      }
    } catch (error) {
      console.error('Failed to split:', error);
    } finally {
      setTerminalContextMenu(null);
    }
  }, [terminalContextMenu, selectedWorkspace, addTabToGroup, updateGroup, fetchGroups, createGroup, setActiveGroupId]);

  // Handle split with static tab (Git/Docker)
  const handleSplitWithStaticTab = useCallback(async (direction: SplitDirection, tabType: import('@/lib/db/schema').TabType, passedGroup: import('@/hooks/useTabGroups').TabGroupInfo | null) => {
    // Capture values at start to avoid closure issues
    const contextMenu = terminalContextMenu;
    const workspace = selectedWorkspace;

    if (!contextMenu || !workspace) return;

    // Only handle git and docker tab types
    if (tabType !== 'git' && tabType !== 'docker') return;

    try {
      // Create new static tab via API
      const tabName = tabType === 'git' ? 'Git' : 'Docker';
      const response = await fetch(`/api/workspaces/${workspace.id}/tabs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: tabName,
          tabType: tabType,
        }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to create tab');
      }

      const { data } = await response.json();
      const newTab = data.tab as TabInfo;

      // Add the new tab to the local ref so SplitViewContainer can find it
      workspaceTabsRef.current = [...workspaceTabsRef.current, newTab];

      // Trigger TabBar refresh to sync with server
      tabBarRef.current?.refreshTabs();

      // Now split with the new tab
      const currentTabId = contextMenu.tabId;
      const currentTab = workspaceTabsRef.current.find(t => t.id === currentTabId);
      if (!currentTab) {
        setTerminalContextMenu(null);
        return;
      }

      // Use the group passed from the context menu (most reliable)
      const currentGroup = passedGroup;

      if (currentGroup) {
        // Add to existing group
        await addTabToGroup(currentGroup.id, newTab.id);
        const newMemberCount = currentGroup.members.length + 1;
        let newLayout = currentGroup.layout;
        if (newMemberCount === 3) {
          newLayout = direction === 'left' || direction === 'right' ? 'left-stack' : 'right-stack';
        } else if (newMemberCount === 4) {
          newLayout = 'grid-2x2';
        }
        if (newLayout !== currentGroup.layout) {
          await updateGroup(currentGroup.id, { layout: newLayout });
        }
        await fetchGroups();
      } else {
        // Create new group
        const tabIds = direction === 'left' || direction === 'top'
          ? [newTab.id, currentTabId]
          : [currentTabId, newTab.id];
        const layout = direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
        const groupName = `Split ${currentTab.name}`;

        const newGroup = await createGroup(groupName, tabIds, layout);
        setActiveGroupId(newGroup.id);
      }
    } catch (error) {
      console.error('Failed to create static tab:', error);
    } finally {
      setTerminalContextMenu(null);
    }
  }, [terminalContextMenu, selectedWorkspace, addTabToGroup, updateGroup, fetchGroups, createGroup, setActiveGroupId]);

  // Handle split with new template tab
  const handleSplitWithTemplate = useCallback(async (direction: SplitDirection, templateId: string, passedGroup: import('@/hooks/useTabGroups').TabGroupInfo | null) => {
    // Capture values at start to avoid closure issues
    const contextMenu = terminalContextMenu;
    const workspace = selectedWorkspace;

    if (!contextMenu || !workspace) return;

    const template = tabTemplates.find(t => t.id === templateId);
    if (!template) return;

    try {
      // Create new tab from template via API
      const response = await fetch(`/api/workspaces/${workspace.id}/tabs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: template.name,
          templateId: template.id,
        }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to create tab');
      }

      const { data } = await response.json();
      const newTab = data.tab as TabInfo;

      // Add the new tab to the local ref so SplitViewContainer can find it
      workspaceTabsRef.current = [...workspaceTabsRef.current, newTab];

      // Trigger TabBar refresh to sync with server
      tabBarRef.current?.refreshTabs();

      // Now split with the new tab - pass the captured contextMenu tabId directly
      const currentTabId = contextMenu.tabId;
      const currentTab = workspaceTabsRef.current.find(t => t.id === currentTabId);
      if (!currentTab) {
        setTerminalContextMenu(null);
        return;
      }

      // Use the group passed from the context menu (most reliable)
      const currentGroup = passedGroup;

      if (currentGroup) {
        // Add to existing group
        await addTabToGroup(currentGroup.id, newTab.id);
        const newMemberCount = currentGroup.members.length + 1;
        let newLayout = currentGroup.layout;
        if (newMemberCount === 3) {
          newLayout = direction === 'left' || direction === 'right' ? 'left-stack' : 'right-stack';
        } else if (newMemberCount === 4) {
          newLayout = 'grid-2x2';
        }
        if (newLayout !== currentGroup.layout) {
          await updateGroup(currentGroup.id, { layout: newLayout });
        }
        await fetchGroups();
      } else {
        // Create new group
        const tabIds = direction === 'left' || direction === 'top'
          ? [newTab.id, currentTabId]
          : [currentTabId, newTab.id];
        const layout = direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
        const groupName = `Split ${currentTab.name}`;

        const newGroup = await createGroup(groupName, tabIds, layout);
        setActiveGroupId(newGroup.id);
      }
    } catch (error) {
      console.error('Failed to create tab from template:', error);
    } finally {
      setTerminalContextMenu(null);
    }
  }, [terminalContextMenu, selectedWorkspace, tabTemplates, addTabToGroup, updateGroup, fetchGroups, createGroup, setActiveGroupId]);

  // Handle voice transcription - send to active terminal
  const handleVoiceTranscription = useCallback((text: string) => {
    if (socket && selectedTab && isTerminalConnected) {
      socket.emit('terminal:input', { data: text });
    }
  }, [socket, selectedTab, isTerminalConnected]);

  // Ctrl+M keyboard shortcut for voice recording
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'm') {
        e.preventDefault();
        if (whisperEnabled && selectedWorkspace && selectedTab && tabBarRef.current) {
          tabBarRef.current.toggleVoice();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [whisperEnabled, selectedWorkspace, selectedTab]);

  const handleSelectWorkspace = useCallback((workspace: Workspace | null, repository: Repository) => {
    setSelectedRepository(repository);
    setSelectedWorkspace(workspace);
    setSelectedTab(null); // Will be auto-selected by TabBar
    setActiveGroupId(null); // Clear active group when switching workspace
    setActiveOperation(null); // Clear any pending operation when switching workspace
  }, [setActiveGroupId]);

  // Handle workspace state updates - update selectedWorkspace with new container status
  const handleWorkspaceUpdate = useCallback((update: WorkspaceStateUpdate) => {
    if (selectedWorkspace && update.workspaceId === selectedWorkspace.id) {
      // Update selectedWorkspace with new container status/info
      // Don't deselect workspace on 'none' status - Dashboard handles it with Deploy button
      setSelectedWorkspace(prev => {
        if (!prev || prev.id !== update.workspaceId) return prev;
        return {
          ...prev,
          ...(update.containerStatus !== undefined && { containerStatus: update.containerStatus }),
          ...(update.containerId !== undefined && { containerId: update.containerId }),
          ...(update.containerIp !== undefined && { containerIp: update.containerIp }),
          ...(update.agentConnected !== undefined && { agentConnectedAt: update.agentConnected ? new Date() : null }),
        };
      });
    }
  }, [selectedWorkspace]);

  // Handle workspace removal (container destroyed or workspace deleted)
  const handleWorkspaceRemoved = useCallback((workspaceId: string) => {
    if (selectedWorkspace?.id === workspaceId) {
      setSelectedTab(null);
      setSelectedWorkspace(null);
    }
  }, [selectedWorkspace]);

  // Subscribe to workspace state updates for the selected workspace
  useWorkspaceState({
    workspaceIds: selectedWorkspace ? [selectedWorkspace.id] : undefined,
    onUpdate: handleWorkspaceUpdate,
  });

  // Container operation handlers for DashboardPanel
  const handleRedeployContainer = useCallback(async () => {
    if (!selectedWorkspace) return;
    setActiveOperation('redeploy'); // Set intent BEFORE API call
    try {
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/redeploy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      if (!response.ok) {
        const { error } = await response.json();
        console.error('Failed to redeploy container:', error?.message);
        setActiveOperation(null); // Clear on error
      }
      // Workspace state will update via WebSocket, operation cleared when agent connects
    } catch (error) {
      console.error('Error redeploying container:', error);
      setActiveOperation(null); // Clear on error
    }
  }, [selectedWorkspace]);

  const handleRestartContainer = useCallback(async () => {
    if (!selectedWorkspace) return;
    try {
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/restart`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      if (!response.ok) {
        const { error } = await response.json();
        console.error('Failed to restart container:', error?.message);
      }
      // Workspace and tab states will update via WebSocket
    } catch (error) {
      console.error('Error restarting container:', error);
    }
  }, [selectedWorkspace]);

  const handleShutdownContainer = useCallback(async () => {
    if (!selectedWorkspace) return;
    try {
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/shutdown`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      if (!response.ok) {
        const { error } = await response.json();
        console.error('Failed to shutdown container:', error?.message);
      }
      // Workspace and tab states will update via WebSocket
    } catch (error) {
      console.error('Error shutting down container:', error);
    }
  }, [selectedWorkspace]);

  const handleStartContainer = useCallback(async () => {
    if (!selectedWorkspace) return;
    // If no container exists, this is a deploy (show progress)
    // If container exists (just exited), this is a start (stay on dashboard)
    const isDeploy = !selectedWorkspace.containerId || selectedWorkspace.containerStatus === 'none';
    if (isDeploy) {
      setActiveOperation('deploy');
    }
    try {
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      if (!response.ok) {
        const { error } = await response.json();
        console.error('Failed to start container:', error?.message);
        if (isDeploy) setActiveOperation(null);
      }
      // Workspace and tab states will update via WebSocket
    } catch (error) {
      console.error('Error starting container:', error);
      if (isDeploy) setActiveOperation(null);
    }
  }, [selectedWorkspace]);

  const handleDestroyContainer = useCallback(async () => {
    if (!selectedWorkspace) return;
    try {
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/destroy?force=true`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      if (!response.ok) {
        const { error } = await response.json();
        console.error('Failed to destroy container:', error?.message);
      }
      // Workspace state will update via WebSocket
    } catch (error) {
      console.error('Error destroying container:', error);
    }
  }, [selectedWorkspace]);

  const handleDeleteWorkspace = useCallback(async () => {
    if (!selectedWorkspace) return;
    const repoId = selectedWorkspace.repositoryId;
    try {
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      if (!response.ok) {
        const { error } = await response.json();
        console.error('Failed to delete workspace:', error?.message);
        return;
      }
      // Clear selection and refresh sidebar
      setSelectedTab(null);
      setSelectedWorkspace(null);
      setRefreshWorkspacesForRepoId(repoId);
    } catch (error) {
      console.error('Error deleting workspace:', error);
    }
  }, [selectedWorkspace]);

  const handleAddWorkspace = useCallback((repositoryId: string, branch?: string) => {
    setWorkspaceRepoId(repositoryId);
    setPreselectedBranch(branch || null);
    setIsAddWorkspaceOpen(true);
  }, []);

  const handleCreateWorkspace = useCallback(async (options: {
    name: string;
    branchName: string;
    baseBranch?: string;
    staticIpAddress?: string;
    staticIpGateway?: string;
    forcedVmid?: number;
    overrideTemplateId?: string;
  }) => {
    if (!workspaceRepoId) return;

    setActionLoading(true);
    try {
      const response = await fetch(`/api/repositories/${workspaceRepoId}/workspaces`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to create workspace');
      }

      const { data } = await response.json();
      const newWorkspace = data.workspace as Workspace;

      // Find the repository for this workspace
      const repo = repositories.find(r => r.id === workspaceRepoId);

      // Close modal immediately, select the new workspace, and trigger deploy
      setIsAddWorkspaceOpen(false);
      if (repo) {
        setSelectedRepository(repo);
        setSelectedWorkspace(newWorkspace);
        setSelectedTab(null);
        setActiveGroupId(null);
        setActiveOperation('deploy'); // Show progress UI
      }

      // Trigger sidebar workspace refresh for this repo
      setRefreshWorkspacesForRepoId(workspaceRepoId);
    } finally {
      setActionLoading(false);
    }
  }, [workspaceRepoId, repositories, setActiveGroupId]);

  const handleCloneRepo = useCallback(async (
    name: string,
    url: string,
    description?: string,
    sshKeyId?: string,
    techStack?: string[],
    templateId?: string,
    cloneDepth?: number,
    resourceMemory?: number | null,
    resourceCpuCores?: number | null,
    resourceDiskSize?: number | null
  ) => {
    setActionLoading(true);
    try {
      await cloneRepository(name, url, description, sshKeyId, techStack, templateId, cloneDepth, resourceMemory, resourceCpuCores, resourceDiskSize);
      await fetchRepositories(); // Refresh to ensure sidebar updates
      setIsAddRepoOpen(false);
    } finally {
      setActionLoading(false);
    }
  }, [cloneRepository, fetchRepositories]);

  // Edit repository handlers
  const handleEditRepository = useCallback((repository: Repository) => {
    setEditingRepository(repository);
  }, []);

  const handleSaveRepository = useCallback(async (updates: {
    name?: string;
    description?: string;
    templateId?: string | null;
    envVars?: Array<{ key: string; value: string; encrypted: boolean }>;
    resourceMemory?: number | null;
    resourceCpuCores?: number | null;
    resourceDiskSize?: number | null;
  }) => {
    if (!editingRepository) return;

    setIsEditRepoLoading(true);
    try {
      // Save repository metadata (includes resources)
      const { envVars, ...repoUpdates } = updates;
      const response = await fetch(`/api/repositories/${editingRepository.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(repoUpdates),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to update repository');
      }

      // Save env vars if provided
      if (envVars) {
        const envResponse = await fetch(`/api/repositories/${editingRepository.id}/env-vars`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ envVars }),
        });

        if (!envResponse.ok) {
          const { error } = await envResponse.json();
          throw new Error(error?.message || 'Failed to update environment variables');
        }
      }

      await fetchRepositories();
      setEditingRepository(null);
    } finally {
      setIsEditRepoLoading(false);
    }
  }, [editingRepository, fetchRepositories]);

  // Template handlers - create and auto-provision in background
  const handleCreateTemplate = useCallback(async (input: {
    name: string;
    description?: string;
    techStacks?: string[];
    isDefault?: boolean;
    staging?: boolean;
    parentTemplateId?: string;
    baseCtTemplate?: string;
  }) => {
    setIsTemplateDialogLoading(true);
    try {
      const template = await createTemplate(input);
      setIsTemplateDialogOpen(false);
      setEditingTemplate(null);
      setCloningTemplate(null); // Clear cloning state

      // Clear any previous errors for this template
      setTemplateErrors((prev) => {
        const next = new Map(prev);
        next.delete(template.id);
        return next;
      });

      // Auto-start provisioning in background (non-blocking)
      startProvisionInBackground(
        template.id,
        { staging: input.staging },
        // onProgress - update progress for this specific template
        (progress) => {
          setTemplateProgress((prev) => new Map(prev).set(template.id, progress));
        },
        // onComplete - clear progress
        () => {
          setTemplateProgress((prev) => {
            const next = new Map(prev);
            next.delete(template.id);
            return next;
          });
        },
        // onError - set error for this template
        (err) => {
          setTemplateErrors((prev) => new Map(prev).set(template.id, err.message));
          setTemplateProgress((prev) => {
            const next = new Map(prev);
            next.delete(template.id);
            return next;
          });
        },
        // onStaging - template is ready for staging customization
        input.staging ? async () => {
          // Fetch updated templates to get the staging container IP
          await fetchTemplates();
          // Set the staging template ID - template will be looked up from templates array
          setStagingTemplateId(template.id);
        } : undefined
      );

      return template;
    } finally {
      setIsTemplateDialogLoading(false);
    }
  }, [createTemplate, startProvisionInBackground, fetchTemplates]);

  const handleUpdateTemplate = useCallback(async (id: string, updates: {
    name?: string;
    description?: string;
    isDefault?: boolean;
  }) => {
    setIsTemplateDialogLoading(true);
    try {
      await updateTemplate(id, updates);
      setIsTemplateDialogOpen(false);
      setEditingTemplate(null);
    } finally {
      setIsTemplateDialogLoading(false);
    }
  }, [updateTemplate]);

  // Open template details modal
  const handleSelectTemplate = useCallback((template: ProxmoxTemplate) => {
    setSelectedTemplate(template);
  }, []);

  // Open edit dialog from details modal
  const handleEditTemplateFromDetails = useCallback((template: ProxmoxTemplate) => {
    setSelectedTemplate(null); // Close details modal
    setEditingTemplate(template);
    setIsTemplateDialogOpen(true);
  }, []);

  const handleProvisionTemplate = useCallback((template: ProxmoxTemplate) => {
    // Clear any previous error
    setTemplateErrors((prev) => {
      const next = new Map(prev);
      next.delete(template.id);
      return next;
    });

    // Start provisioning in background - modal can be closed
    startProvisionInBackground(
      template.id,
      undefined,
      (progress) => {
        setTemplateProgress((prev) => new Map(prev).set(template.id, progress));
      },
      () => {
        setTemplateProgress((prev) => {
          const next = new Map(prev);
          next.delete(template.id);
          return next;
        });
      },
      (err) => {
        setTemplateErrors((prev) => new Map(prev).set(template.id, err.message));
        setTemplateProgress((prev) => {
          const next = new Map(prev);
          next.delete(template.id);
          return next;
        });
      }
    );
  }, [startProvisionInBackground]);

  const handleRecreateTemplate = useCallback((template: ProxmoxTemplate) => {
    // Clear any previous error
    setTemplateErrors((prev) => {
      const next = new Map(prev);
      next.delete(template.id);
      return next;
    });

    // Start recreation in background - modal can be closed
    startRecreateInBackground(
      template.id,
      (progress) => {
        setTemplateProgress((prev) => new Map(prev).set(template.id, progress));
      },
      () => {
        setTemplateProgress((prev) => {
          const next = new Map(prev);
          next.delete(template.id);
          return next;
        });
      },
      (err) => {
        setTemplateErrors((prev) => new Map(prev).set(template.id, err.message));
        setTemplateProgress((prev) => {
          const next = new Map(prev);
          next.delete(template.id);
          return next;
        });
      }
    );
  }, [startRecreateInBackground]);

  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    await deleteTemplate(templateId);
    setSelectedTemplate(null); // Close modal after delete
    await fetchRepositories(); // Refresh to update any repos that had this template
  }, [deleteTemplate, fetchRepositories]);

  // Clone a template (open dialog with parent template set)
  const handleCloneTemplate = useCallback((template: ProxmoxTemplate) => {
    setSelectedTemplate(null); // Close details modal
    setEditingTemplate(null); // Not editing
    setCloningTemplate(template); // Set parent for cloning
    setIsTemplateDialogOpen(true);
  }, []);

  // Open staging terminal for a template
  const handleOpenStagingTerminal = useCallback((template: ProxmoxTemplate) => {
    setSelectedTemplate(null); // Close details modal if open
    setStagingTemplateId(template.id);
  }, []);

  // Finalize a staging template
  const handleFinalizeTemplate = useCallback(async () => {
    if (!stagingTemplateId) return;

    setIsFinalizing(true);
    try {
      await finalizeTemplate(stagingTemplateId, (progress) => {
        setTemplateProgress((prev) => new Map(prev).set(stagingTemplateId, progress));
      });
      setStagingTemplateId(null);
      await fetchTemplates();
    } catch (err) {
      setTemplateErrors((prev) => new Map(prev).set(
        stagingTemplateId,
        err instanceof Error ? err.message : 'Failed to finalize template'
      ));
    } finally {
      setIsFinalizing(false);
      setTemplateProgress((prev) => {
        const next = new Map(prev);
        next.delete(stagingTemplateId);
        return next;
      });
    }
  }, [stagingTemplateId, finalizeTemplate, fetchTemplates]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-foreground-secondary">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 flex-shrink-0 border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">Session Hub</h1>
          {selectedRepository && (
            <>
              <span className="text-foreground-tertiary">/</span>
              <span className="text-foreground">{selectedRepository.name}</span>
            </>
          )}
          {selectedWorkspace && (
            <>
              <span className="text-foreground-tertiary">/</span>
              <span className="text-primary">{selectedWorkspace.name}</span>
              <span className="text-xs text-foreground-tertiary bg-background-tertiary px-2 py-0.5 rounded">
                {selectedWorkspace.branchName}
              </span>
            </>
          )}
          {selectedTab && isTerminalConnected && (
            <span className="px-2 py-0.5 text-xs bg-success/20 text-success rounded">
              Connected
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-foreground-secondary">{user?.username}</span>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="text-foreground-secondary hover:text-foreground transition-colors"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={logout}
            className="text-sm text-foreground-secondary hover:text-foreground transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar - Repository tree + Templates */}
        <aside className="w-72 border-r border-border flex-shrink-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <RepositoryTree
              onSelectWorkspace={handleSelectWorkspace}
              selectedWorkspaceId={selectedWorkspace?.id}
              selectedRepositoryId={selectedRepository?.id}
              onAddRepository={() => setIsAddRepoOpen(true)}
              onAddWorkspace={handleAddWorkspace}
              onEditRepository={handleEditRepository}
              repositories={repositories}
              isLoading={reposLoading}
              error={reposError}
              onDeleteRepository={deleteRepository}
              refreshWorkspacesForRepoId={refreshWorkspacesForRepoId}
              onWorkspacesRefreshed={() => setRefreshWorkspacesForRepoId(null)}
              onWorkspaceRemoved={handleWorkspaceRemoved}
              initialExpandedRepos={uiStateLoaded ? persistedExpandedRepos : undefined}
              onExpandedReposChange={persistExpandedRepos}
              onWorkspacesLoaded={handleWorkspacesLoaded}
            />
          </div>
          <TemplateSection
            templates={templates}
            isLoading={templatesLoading}
            onAddTemplate={() => {
              setEditingTemplate(null);
              setIsTemplateDialogOpen(true);
            }}
            onSelectTemplate={handleSelectTemplate}
          />
        </aside>

        {/* Main area - Tabs + Terminal */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0">
          {selectedWorkspace ? (
            <WorkspaceContent
              workspace={selectedWorkspace}
              activeOperation={activeOperation}
              onOperationComplete={() => setActiveOperation(null)}
            >
              {/* Tab bar */}
              <TabBar
                ref={tabBarRef}
                workspaceId={selectedWorkspace.id}
                selectedTabId={selectedTab?.id || null}
                onSelectTab={setSelectedTab}
                onTabsChange={handleTabsChange}
                onExposeDeleteTab={(fn) => { deleteTabRef.current = fn; }}
                whisperEnabled={whisperEnabled}
                onVoiceTranscription={handleVoiceTranscription}
                workspaceTechStacks={workspaceTechStacks}
                // Tab group props
                groups={groups}
                groupedTabIds={groupedTabIds}
                activeGroupId={activeGroupId}
                onSelectGroup={setActiveGroupId}
                onUngroupTabs={handleUngroupTabs}
                onRenameGroup={handleRenameGroup}
                onCloseGroup={handleCloseGroup}
                // Multi-select props
                multiSelectMode={multiSelectMode}
                selectedTabIdsForGroup={selectedTabIdsForGroup}
                onToggleTabSelection={toggleTabSelection}
                onEnterMultiSelectMode={enterMultiSelectMode}
                onExitMultiSelectMode={exitMultiSelectMode}
                onCreateGroupClick={() => setIsCreateGroupDialogOpen(true)}
                // Drag and drop reordering props
                onGroupsUpdate={setGroups}
                onRefetch={fetchGroups}
              />

              {/* Terminal/Git/Split View area */}
              <div className="flex-1 p-4 min-h-0 flex flex-col">
                {activeGroupId && activeGroup ? (
                  // Split view for tab group
                  <div className="flex-1 min-h-0 border border-border rounded overflow-hidden">
                    <SplitViewContainer
                      group={activeGroup}
                      tabs={workspaceTabsRef.current}
                      workspaceId={selectedWorkspace.id}
                      containerIp={selectedWorkspace.containerIp}
                      onPaneResize={handlePaneResize}
                      onConnectionChange={(tabId, connected) => {
                        // Track connection for the first running tab in group
                        if (activeGroup.members[0]?.tabId === tabId) {
                          setIsTerminalConnected(connected);
                        }
                      }}
                      onTabEnd={(tabId) => {
                        // Handle tab end within split view
                        if (deleteTabRef.current) {
                          deleteTabRef.current(tabId).catch(console.error);
                        }
                      }}
                      onTerminalContextMenu={handleTerminalContextMenu}
                    />
                  </div>
                ) : selectedTab && selectedTab.tabType === 'dashboard' ? (
                  // Dashboard panel - workspace overview
                  <DashboardPanel
                    workspace={selectedWorkspace}
                    repository={selectedRepository}
                    onRestartContainer={handleRestartContainer}
                    onShutdownContainer={handleShutdownContainer}
                    onStartContainer={handleStartContainer}
                    onRedeployContainer={handleRedeployContainer}
                    onDestroyContainer={handleDestroyContainer}
                    onDeleteWorkspace={handleDeleteWorkspace}
                  />
                ) : selectedTab && selectedTab.tabType === 'git' ? (
                  // Git panel - no terminal needed
                  <GitPanel workspaceId={selectedWorkspace.id} />
                ) : selectedTab && selectedTab.tabType === 'docker' ? (
                  // Docker panel - no terminal needed
                  <DockerPanel workspaceId={selectedWorkspace.id} containerIp={selectedWorkspace.containerIp ?? null} />
                ) : selectedTab && selectedTab.status === 'running' ? (
                  <Terminal
                    key={selectedTab.id}
                    tabId={selectedTab.id}
                    workspaceId={selectedWorkspace.id}
                    onConnectionChange={setIsTerminalConnected}
                    onEnd={() => {
                      setIsTerminalConnected(false);
                      // Close the tab when session ends and switch to previous tab
                      if (selectedTab && deleteTabRef.current) {
                        const tabs = workspaceTabsRef.current;
                        const currentIndex = tabs.findIndex(t => t.id === selectedTab.id);
                        // Select the tab before this one, or the next one, or null
                        const nextTab = currentIndex > 0
                          ? tabs[currentIndex - 1]
                          : tabs[currentIndex + 1] || null;
                        setSelectedTab(nextTab);
                        deleteTabRef.current(selectedTab.id).catch(console.error);
                      }
                    }}
                    onContextMenu={handleTerminalContextMenu}
                  />
                ) : selectedTab ? (
                  <div className="h-full flex items-center justify-center text-foreground-tertiary">
                    <div className="text-center">
                      <p className="text-lg">Tab is {selectedTab.status}</p>
                      <p className="text-sm mt-2">
                        {selectedTab.status === 'pending' || selectedTab.status === 'stopped'
                          ? 'Click the tab to start it'
                          : selectedTab.status === 'starting'
                          ? 'Starting container...'
                          : 'Tab encountered an error'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-foreground-tertiary">
                    <div className="text-center">
                      <p className="text-lg">No tab selected</p>
                      <p className="text-sm mt-2">
                        Create a new tab or select an existing one
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </WorkspaceContent>
          ) : selectedRepository ? (
            // Show repository dashboard when repo is selected but no workspace
            <RepositoryDashboard
              repository={selectedRepository}
              onBranchClick={(branch) => handleAddWorkspace(selectedRepository.id, branch)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-foreground-tertiary">
              <div className="text-center">
                <p className="text-lg">No repository selected</p>
                <p className="text-sm mt-2">
                  Select a repository from the sidebar or add a new one
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Dialogs */}
      <AddRepositoryDialog
        isOpen={isAddRepoOpen}
        onClose={() => setIsAddRepoOpen(false)}
        onClone={handleCloneRepo}
        isLoading={actionLoading}
        templates={templates}
      />

      <CreateWorkspaceDialog
        isOpen={isAddWorkspaceOpen}
        repositoryId={workspaceRepoId}
        initialBranch={preselectedBranch}
        templates={templates}
        onClose={() => {
          setIsAddWorkspaceOpen(false);
          setWorkspaceRepoId(null);
          setPreselectedBranch(null);
        }}
        onCreate={handleCreateWorkspace}
        isLoading={actionLoading}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          // Re-fetch whisper settings in case user configured the API key
          fetchWhisperSettings();
        }}
        onVoiceSettingsChange={fetchWhisperSettings}
      />

      {/* Edit Repository Dialog */}
      <EditRepositoryDialog
        isOpen={!!editingRepository}
        onClose={() => setEditingRepository(null)}
        repository={editingRepository}
        templates={templates}
        onSave={handleSaveRepository}
        isLoading={isEditRepoLoading}
      />

      {/* Template Dialog (Create/Edit/Clone) */}
      <TemplateDialog
        isOpen={isTemplateDialogOpen}
        onClose={() => {
          setIsTemplateDialogOpen(false);
          setEditingTemplate(null);
          setCloningTemplate(null);
        }}
        template={editingTemplate}
        parentTemplate={cloningTemplate}
        templates={templates}
        defaultCtTemplate={proxmoxSettings?.templates?.defaultCtTemplate}
        onSave={async (input) => {
          if (editingTemplate) {
            await handleUpdateTemplate(editingTemplate.id, input);
          } else {
            await handleCreateTemplate(input);
          }
        }}
        isLoading={isTemplateDialogLoading}
      />

      {/* Template Details Modal */}
      <TemplateDetailsModal
        isOpen={!!selectedTemplate}
        template={selectedTemplate}
        templates={templates}
        onClose={() => {
          // Always allow closing - provisioning continues in background
          setSelectedTemplate(null);
        }}
        onEdit={handleEditTemplateFromDetails}
        onProvision={handleProvisionTemplate}
        onRecreate={handleRecreateTemplate}
        onDelete={handleDeleteTemplate}
        onClone={handleCloneTemplate}
        onOpenStagingTerminal={handleOpenStagingTerminal}
        onFinalize={handleOpenStagingTerminal} // Opens terminal for manual finalize
        isProvisioning={selectedTemplate ? isTemplateProvisioning(selectedTemplate.id) : false}
        provisionProgress={selectedTemplate ? templateProgress.get(selectedTemplate.id) || null : null}
        provisionError={selectedTemplate ? templateErrors.get(selectedTemplate.id) || null : null}
        provisionLogs={provisionLogs}
      />

      {/* Staging Terminal Modal */}
      <StagingTerminalModal
        isOpen={!!stagingTemplateId}
        template={stagingTemplate}
        onClose={() => setStagingTemplateId(null)}
        onFinalize={handleFinalizeTemplate}
        isFinalizing={isFinalizing}
      />

      {/* Create Tab Group Dialog */}
      <CreateGroupDialog
        isOpen={isCreateGroupDialogOpen}
        onClose={() => {
          setIsCreateGroupDialogOpen(false);
          exitMultiSelectMode();
        }}
        selectedTabIds={selectedTabIdsForGroup}
        tabs={workspaceTabsRef.current}
        onCreate={handleCreateGroup}
      />

      {/* Terminal context menu */}
      {terminalContextMenu && selectedWorkspace && (() => {
        const tab = workspaceTabsRef.current.find(t => t.id === terminalContextMenu.tabId);
        if (!tab) return null;
        return (
          <TerminalContextMenu
            position={terminalContextMenu.position}
            tab={tab}
            currentGroup={getGroupForTab(terminalContextMenu.tabId)}
            availableTabs={workspaceTabsRef.current.filter(
              t => t.id !== terminalContextMenu.tabId && !groupedTabIds.has(t.id) && t.tabType !== 'dashboard'
            )}
            groups={groups}
            templates={tabTemplates.filter(t =>
              !t.requiredTechStack || workspaceTechStacks.includes(t.requiredTechStack)
            )}
            onClose={() => setTerminalContextMenu(null)}
            onDelete={async () => {
              if (deleteTabRef.current) {
                await deleteTabRef.current(terminalContextMenu.tabId);
              }
            }}
            onDuplicate={async () => {
              // Create duplicate tab via API
              try {
                const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/tabs`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    name: `${tab.name} (copy)`,
                  }),
                });
                if (!response.ok) {
                  console.error('Failed to duplicate tab');
                }
                // Refresh tabs to show the new duplicate
                tabBarRef.current?.refreshTabs();
              } catch (error) {
                console.error('Error duplicating tab:', error);
              }
            }}
            onAddToGroup={async (groupId) => {
              try {
                await addTabToGroup(groupId, tab.id);
                await fetchGroups();
              } catch (error) {
                console.error('Failed to add tab to group:', error);
              }
            }}
            onStartMultiSelect={() => {
              enterMultiSelectMode();
              toggleTabSelection(tab.id);
            }}
            existingTabTypes={workspaceTabsRef.current.map(t => t.tabType)}
            workspaceTechStacks={workspaceTechStacks}
            onSplitWithExisting={handleSplitWithExisting}
            onSplitWithTemplate={handleSplitWithTemplate}
            onSplitWithStaticTab={handleSplitWithStaticTab}
          />
        );
      })()}

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-background-secondary border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-2 z-50">
          <span className="text-warning">⚠️</span>
          <span className="text-sm text-foreground">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-foreground-tertiary hover:text-foreground ml-2"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  // Create auth state once at the top level
  const authState = useAuthState();

  return (
    <AuthProvider value={authState}>
      <Dashboard />
    </AuthProvider>
  );
}

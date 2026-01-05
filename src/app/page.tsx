'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuthState, AuthProvider, useAuth } from '@/hooks/useAuth';
import { useRepositories } from '@/hooks/useRepositories';
import { useWorkspaceState, WorkspaceStateUpdate } from '@/hooks/useWorkspaceState';
import { useTemplates, type ProvisionProgress } from '@/hooks/useTemplates';
import { RepositoryTree } from '@/components/repositories/repository-tree';
import { AddRepositoryDialog } from '@/components/repositories/add-repository-dialog';
import { EditRepositoryDialog } from '@/components/repositories/edit-repository-dialog';
import { CreateWorkspaceDialog } from '@/components/workspaces/create-workspace-dialog';
import { TabBar } from '@/components/tabs/tab-bar';
import { LoginForm } from '@/components/auth/login-form';
import { SettingsModal } from '@/components/settings/settings-modal';
import { GitPanel } from '@/components/git';
import { RepositoryDashboard } from '@/components/repositories/repository-dashboard';
import { TemplateSection, TemplateDialog, TemplateDetailsModal } from '@/components/templates';
import type { Repository, Workspace, ProxmoxTemplate } from '@/lib/db/schema';
import type { TabInfo } from '@/hooks/useTabs';

// Dynamic import with SSR disabled - xterm.js uses browser-only APIs
const Terminal = dynamic(
  () => import('@/components/terminal/terminal').then(mod => ({ default: mod.Terminal })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-gray-500">
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
    createLocalRepository,
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
    startProvisionInBackground,
    startRecreateInBackground,
    isTemplateProvisioning,
  } = useTemplates();

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

  // Dialog state
  const [isAddRepoOpen, setIsAddRepoOpen] = useState(false);
  const [isAddWorkspaceOpen, setIsAddWorkspaceOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [workspaceRepoId, setWorkspaceRepoId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit repository state
  const [editingRepository, setEditingRepository] = useState<Repository | null>(null);
  const [isEditRepoLoading, setIsEditRepoLoading] = useState(false);

  // Template dialog state
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProxmoxTemplate | null>(null);
  const [isTemplateDialogLoading, setIsTemplateDialogLoading] = useState(false);

  // Template details modal state (for viewing status, errors, actions)
  const [selectedTemplate, setSelectedTemplate] = useState<ProxmoxTemplate | null>(null);
  // Track progress per template (keyed by template ID)
  const [templateProgress, setTemplateProgress] = useState<Map<string, ProvisionProgress>>(new Map());
  const [templateErrors, setTemplateErrors] = useState<Map<string, string>>(new Map());

  // Terminal state
  const [isTerminalConnected, setIsTerminalConnected] = useState(false);
  const deleteTabRef = useRef<((tabId: string) => Promise<void>) | null>(null);
  const workspaceTabsRef = useRef<TabInfo[]>([]);

  const handleSelectWorkspace = useCallback((workspace: Workspace | null, repository: Repository) => {
    setSelectedRepository(repository);
    setSelectedWorkspace(workspace);
    setSelectedTab(null); // Will be auto-selected by TabBar
  }, []);

  // Handle container destruction - clear tabs when container is destroyed
  const handleWorkspaceUpdate = useCallback((update: WorkspaceStateUpdate) => {
    if (selectedWorkspace && update.workspaceId === selectedWorkspace.id) {
      // If container was destroyed (status changed to 'none'), clear tabs
      if (update.containerStatus === 'none') {
        setSelectedTab(null);
        // Deselect workspace to show repository dashboard
        setSelectedWorkspace(null);
      }
    }
  }, [selectedWorkspace]);

  // Subscribe to workspace state updates for the selected workspace
  useWorkspaceState({
    workspaceIds: selectedWorkspace ? [selectedWorkspace.id] : undefined,
    onUpdate: handleWorkspaceUpdate,
  });

  const handleAddWorkspace = useCallback((repositoryId: string) => {
    setWorkspaceRepoId(repositoryId);
    setIsAddWorkspaceOpen(true);
  }, []);

  const handleCreateWorkspace = useCallback(async (name: string, branchName: string, baseBranch?: string) => {
    if (!workspaceRepoId) return;

    setActionLoading(true);
    try {
      const response = await fetch(`/api/repositories/${workspaceRepoId}/workspaces`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, branchName, baseBranch }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to create workspace');
      }

      // Refresh repositories to get updated workspaces
      await fetchRepositories();
      setIsAddWorkspaceOpen(false);
    } finally {
      setActionLoading(false);
    }
  }, [workspaceRepoId, fetchRepositories]);

  const handleAddLocalRepo = useCallback(async (name: string, path: string, description?: string, techStack?: string[], templateId?: string) => {
    setActionLoading(true);
    try {
      await createLocalRepository(name, path, description, techStack, templateId);
      await fetchRepositories(); // Refresh to ensure sidebar updates
      setIsAddRepoOpen(false);
    } finally {
      setActionLoading(false);
    }
  }, [createLocalRepository, fetchRepositories]);

  const handleCloneRepo = useCallback(async (name: string, url: string, description?: string, sshKeyId?: string, techStack?: string[], templateId?: string) => {
    setActionLoading(true);
    try {
      await cloneRepository(name, url, description, sshKeyId, techStack, templateId);
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
  }) => {
    if (!editingRepository) return;

    setIsEditRepoLoading(true);
    try {
      const response = await fetch(`/api/repositories/${editingRepository.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to update repository');
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
  }) => {
    setIsTemplateDialogLoading(true);
    try {
      const template = await createTemplate(input);
      setIsTemplateDialogOpen(false);
      setEditingTemplate(null);

      // Clear any previous errors for this template
      setTemplateErrors((prev) => {
        const next = new Map(prev);
        next.delete(template.id);
        return next;
      });

      // Auto-start provisioning in background (non-blocking)
      startProvisionInBackground(
        template.id,
        undefined,
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
        }
      );

      return template;
    } finally {
      setIsTemplateDialogLoading(false);
    }
  }, [createTemplate, startProvisionInBackground]);

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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 flex-shrink-0 border-b border-gray-700 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-white">Session Hub</h1>
          {selectedRepository && (
            <>
              <span className="text-gray-500">/</span>
              <span className="text-gray-300">{selectedRepository.name}</span>
            </>
          )}
          {selectedWorkspace && (
            <>
              <span className="text-gray-500">/</span>
              <span className="text-blue-400">{selectedWorkspace.name}</span>
              <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">
                {selectedWorkspace.branchName}
              </span>
            </>
          )}
          {selectedTab && isTerminalConnected && (
            <span className="px-2 py-0.5 text-xs bg-green-600/20 text-green-400 rounded">
              Connected
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user?.username}</span>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="text-gray-400 hover:text-white transition-colors"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar - Repository tree + Templates */}
        <aside className="w-72 border-r border-gray-700 flex-shrink-0 overflow-hidden flex flex-col">
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
            <>
              {/* Tab bar */}
              <TabBar
                workspaceId={selectedWorkspace.id}
                selectedTabId={selectedTab?.id || null}
                onSelectTab={setSelectedTab}
                onTabsChange={(tabs) => { workspaceTabsRef.current = tabs; }}
                onExposeDeleteTab={(fn) => { deleteTabRef.current = fn; }}
              />

              {/* Terminal/Git area */}
              <div className="flex-1 p-4 min-h-0">
                {selectedTab && selectedTab.tabType === 'git' ? (
                  // Git panel - no terminal needed
                  <GitPanel workspaceId={selectedWorkspace.id} />
                ) : selectedTab && selectedTab.status === 'running' ? (
                  <Terminal
                    tabId={selectedTab.id}
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
                  />
                ) : selectedTab ? (
                  <div className="h-full flex items-center justify-center text-gray-500">
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
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <p className="text-lg">No tab selected</p>
                      <p className="text-sm mt-2">
                        Create a new tab or select an existing one
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : selectedRepository ? (
            // Show repository dashboard when repo is selected but no workspace
            <RepositoryDashboard repository={selectedRepository} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
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
        onAddLocal={handleAddLocalRepo}
        onClone={handleCloneRepo}
        isLoading={actionLoading}
        templates={templates}
      />

      <CreateWorkspaceDialog
        isOpen={isAddWorkspaceOpen}
        repositoryId={workspaceRepoId}
        onClose={() => {
          setIsAddWorkspaceOpen(false);
          setWorkspaceRepoId(null);
        }}
        onCreate={handleCreateWorkspace}
        isLoading={actionLoading}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
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

      {/* Template Dialog (Create/Edit) */}
      <TemplateDialog
        isOpen={isTemplateDialogOpen}
        onClose={() => {
          setIsTemplateDialogOpen(false);
          setEditingTemplate(null);
        }}
        template={editingTemplate}
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
        onClose={() => {
          // Always allow closing - provisioning continues in background
          setSelectedTemplate(null);
        }}
        onEdit={handleEditTemplateFromDetails}
        onProvision={handleProvisionTemplate}
        onRecreate={handleRecreateTemplate}
        onDelete={handleDeleteTemplate}
        isProvisioning={selectedTemplate ? isTemplateProvisioning(selectedTemplate.id) : false}
        provisionProgress={selectedTemplate ? templateProgress.get(selectedTemplate.id) || null : null}
        provisionError={selectedTemplate ? templateErrors.get(selectedTemplate.id) || null : null}
      />
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

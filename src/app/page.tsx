'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useAuthState, AuthProvider, useAuth } from '@/hooks/useAuth';
import { useRepositories } from '@/hooks/useRepositories';
import { RepositoryTree } from '@/components/repositories/repository-tree';
import { AddRepositoryDialog } from '@/components/repositories/add-repository-dialog';
import { CreateWorkspaceDialog } from '@/components/workspaces/create-workspace-dialog';
import { TabBar } from '@/components/tabs/tab-bar';
import { LoginForm } from '@/components/auth/login-form';
import { SettingsModal } from '@/components/settings/settings-modal';
import type { Repository, Workspace } from '@/lib/db/schema';
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
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const {
    createLocalRepository,
    cloneRepository,
    fetchRepositories,
  } = useRepositories();

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

  // Terminal state
  const [isTerminalConnected, setIsTerminalConnected] = useState(false);

  const handleSelectWorkspace = useCallback((workspace: Workspace, repository: Repository) => {
    setSelectedRepository(repository);
    setSelectedWorkspace(workspace);
    setSelectedTab(null); // Will be auto-selected by TabBar
  }, []);

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

  const handleAddLocalRepo = useCallback(async (name: string, path: string, description?: string) => {
    setActionLoading(true);
    try {
      await createLocalRepository(name, path, description);
      setIsAddRepoOpen(false);
    } finally {
      setActionLoading(false);
    }
  }, [createLocalRepository]);

  const handleCloneRepo = useCallback(async (name: string, url: string, description?: string, sshKeyId?: string) => {
    setActionLoading(true);
    try {
      await cloneRepository(name, url, description, sshKeyId);
      setIsAddRepoOpen(false);
    } finally {
      setActionLoading(false);
    }
  }, [cloneRepository]);

  if (isLoading) {
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
        {/* Sidebar - Repository tree */}
        <aside className="w-72 border-r border-gray-700 flex-shrink-0 overflow-hidden flex flex-col">
          <RepositoryTree
            onSelectWorkspace={handleSelectWorkspace}
            selectedWorkspaceId={selectedWorkspace?.id}
            onAddRepository={() => setIsAddRepoOpen(true)}
            onAddWorkspace={handleAddWorkspace}
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
              />

              {/* Terminal area */}
              <div className="flex-1 p-4 min-h-0">
                {selectedTab && selectedTab.status === 'running' ? (
                  <Terminal
                    tabId={selectedTab.id}
                    onConnectionChange={setIsTerminalConnected}
                    onEnd={() => {
                      setIsTerminalConnected(false);
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
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-lg">No workspace selected</p>
                <p className="text-sm mt-2">
                  Select a workspace from the sidebar or create a new one
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

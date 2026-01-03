'use client';

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { Repository, Workspace } from '@/lib/db/schema';

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isGitRepo: boolean;
}

interface BrowseResult {
  currentPath: string;
  parentPath: string | null;
  entries: DirectoryEntry[];
}

export function useRepositories() {
  const { token } = useAuth();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRepositories = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/repositories', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch repositories');
      }

      const { data } = await response.json();
      setRepositories(data.repositories);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const createLocalRepository = useCallback(
    async (name: string, originalPath: string, description?: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/repositories', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'local',
          name,
          originalPath,
          description,
        }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to create repository');
      }

      const { data } = await response.json();
      setRepositories((prev) => [data.repository, ...prev]);
      return data.repository as Repository;
    },
    [token]
  );

  const cloneRepository = useCallback(
    async (name: string, cloneUrl: string, description?: string, sshKeyId?: string) => {
      if (!token) throw new Error('Not authenticated');

      const body: Record<string, unknown> = {
        type: 'clone',
        name,
        cloneUrl,
      };
      if (description) body.description = description;
      if (sshKeyId) body.sshKeyId = sshKeyId;

      const response = await fetch('/api/repositories', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to clone repository');
      }

      const { data } = await response.json();
      setRepositories((prev) => [data.repository, ...prev]);
      return data.repository as Repository;
    },
    [token]
  );

  const deleteRepository = useCallback(
    async (repoId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/repositories/${repoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete repository');
      }

      setRepositories((prev) => prev.filter((r) => r.id !== repoId));
    },
    [token]
  );

  const browseDirectories = useCallback(
    async (path?: string): Promise<BrowseResult> => {
      if (!token) throw new Error('Not authenticated');

      const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse';
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to browse directories');
      }

      const { data } = await response.json();
      return data;
    },
    [token]
  );

  const getRepositoryWithBranches = useCallback(
    async (repoId: string): Promise<{ repository: Repository; branches: string[] }> => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/repositories/${repoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch repository');
      }

      const { data } = await response.json();
      return data;
    },
    [token]
  );

  return {
    repositories,
    isLoading,
    error,
    fetchRepositories,
    createLocalRepository,
    cloneRepository,
    deleteRepository,
    browseDirectories,
    getRepositoryWithBranches,
  };
}

export function useWorkspaces(repositoryId: string | null) {
  const { token } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    if (!token || !repositoryId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/repositories/${repositoryId}/workspaces`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch workspaces');
      }

      const { data } = await response.json();
      setWorkspaces(data.workspaces);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [token, repositoryId]);

  const createWorkspace = useCallback(
    async (name: string, branchName: string, baseBranch?: string) => {
      if (!token || !repositoryId) throw new Error('Not authenticated or no repository selected');

      const response = await fetch(`/api/repositories/${repositoryId}/workspaces`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, branchName, baseBranch }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to create workspace');
      }

      const { data } = await response.json();
      setWorkspaces((prev) => [data.workspace, ...prev]);
      return data.workspace as Workspace;
    },
    [token, repositoryId]
  );

  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete workspace');
      }

      setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
    },
    [token]
  );

  return {
    workspaces,
    isLoading,
    error,
    fetchWorkspaces,
    createWorkspace,
    deleteWorkspace,
  };
}

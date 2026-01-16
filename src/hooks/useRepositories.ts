'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';
import { useWorkspaceState } from './useWorkspaceState';
import type { Repository, Workspace, ContainerStatus } from '@/lib/db/schema';

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

  const cloneRepository = useCallback(
    async (
      name: string,
      cloneUrl: string,
      description?: string,
      sshKeyId?: string,
      techStack?: string[],
      templateId?: string,
      cloneDepth?: number,
      resourceMemory?: number | null,
      resourceCpuCores?: number | null,
      resourceDiskSize?: number | null
    ) => {
      if (!token) throw new Error('Not authenticated');

      const body: Record<string, unknown> = {
        name,
        cloneUrl,
      };
      if (description) body.description = description;
      if (sshKeyId) body.sshKeyId = sshKeyId;
      if (techStack && techStack.length > 0) body.techStack = techStack;
      if (templateId) body.templateId = templateId;
      if (cloneDepth !== undefined) body.cloneDepth = cloneDepth;
      // Resource overrides (null means use defaults)
      if (resourceMemory !== undefined) body.resourceMemory = resourceMemory;
      if (resourceCpuCores !== undefined) body.resourceCpuCores = resourceCpuCores;
      if (resourceDiskSize !== undefined) body.resourceDiskSize = resourceDiskSize;

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
        throw new Error(error?.message || 'Failed to add repository');
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
    cloneRepository,
    deleteRepository,
    getRepositoryWithBranches,
  };
}

export function useWorkspaces(repositoryId: string | null) {
  const { token } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Extract workspace IDs for real-time updates
  const workspaceIds = workspaces.map(w => w.id);

  // Handle real-time workspace state updates
  const handleWorkspaceUpdate = useCallback((update: {
    workspaceId: string;
    containerId?: string | null;
    containerStatus?: ContainerStatus;
    containerIp?: string | null;
    agentConnected?: boolean;
    agentVersion?: string | null;
  }) => {
    setWorkspaces(prev => prev.map(ws => {
      if (ws.id !== update.workspaceId) return ws;

      // Create updated workspace with changed fields
      const updated = { ...ws };
      if (update.containerId !== undefined) updated.containerId = update.containerId;
      if (update.containerStatus !== undefined) updated.containerStatus = update.containerStatus;
      if (update.containerIp !== undefined) updated.containerIp = update.containerIp;
      if (update.agentConnected !== undefined) {
        updated.agentConnectedAt = update.agentConnected ? new Date().toISOString() : null;
      }
      if (update.agentVersion !== undefined) updated.agentVersion = update.agentVersion;

      return updated;
    }));
  }, []);

  // Subscribe to real-time workspace state updates
  useWorkspaceState({
    workspaceIds,
    onUpdate: handleWorkspaceUpdate,
  });

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

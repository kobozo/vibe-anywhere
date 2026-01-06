'use client';

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

export interface TabTemplate {
  id: string;
  userId: string;
  name: string;
  icon: string;
  command: string;
  args: string[];
  description: string | null;
  exitOnClose: boolean;
  sortOrder: number;
  isBuiltIn: boolean;
  requiredTechStack: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useTabTemplates() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<TabTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tab-templates', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tab templates');
      }

      const { data } = await response.json();
      setTemplates(data.templates);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const createTemplate = useCallback(
    async (input: {
      name: string;
      icon?: string;
      command: string;
      args?: string[];
      description?: string;
      exitOnClose?: boolean;
      requiredTechStack?: string | null;
    }) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/tab-templates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to create template');
      }

      const { data } = await response.json();
      setTemplates((prev) => [...prev, data.template]);
      return data.template as TabTemplate;
    },
    [token]
  );

  const updateTemplate = useCallback(
    async (
      templateId: string,
      updates: Partial<{
        name: string;
        icon: string;
        command: string;
        args: string[];
        description: string;
        requiredTechStack: string | null;
      }>
    ) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/tab-templates/${templateId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update template');
      }

      const { data } = await response.json();
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? data.template : t))
      );
      return data.template as TabTemplate;
    },
    [token]
  );

  const deleteTemplate = useCallback(
    async (templateId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/tab-templates/${templateId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to delete template');
      }

      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    },
    [token]
  );

  return {
    templates,
    isLoading,
    error,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}

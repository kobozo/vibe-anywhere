'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';
import type { ProxmoxTemplate, TemplateStatus } from '@/lib/db/schema';

export interface CreateTemplateInput {
  name: string;
  description?: string;
  techStacks?: string[];
  isDefault?: boolean;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  isDefault?: boolean;
}

export interface ProvisionProgress {
  step: string;
  progress: number;
  message: string;
}

export function useTemplates() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<ProxmoxTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/templates', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch templates');
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
    async (input: CreateTemplateInput): Promise<ProxmoxTemplate> => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/templates', {
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
      setTemplates((prev) => [data.template, ...prev]);
      return data.template as ProxmoxTemplate;
    },
    [token]
  );

  const updateTemplate = useCallback(
    async (templateId: string, updates: UpdateTemplateInput): Promise<ProxmoxTemplate> => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to update template');
      }

      const { data } = await response.json();
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? data.template : t))
      );
      return data.template as ProxmoxTemplate;
    },
    [token]
  );

  const deleteTemplate = useCallback(
    async (templateId: string): Promise<void> => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/templates/${templateId}`, {
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

  const provisionTemplate = useCallback(
    async (
      templateId: string,
      options?: { storage?: string; node?: string },
      onProgress?: (progress: ProvisionProgress) => void
    ): Promise<void> => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/templates/${templateId}/provision`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options || {}),
      });

      if (!response.ok && !response.headers.get('content-type')?.includes('text/event-stream')) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to provision template');
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventMatch = line.match(/event: (\w+)/);
          const dataMatch = line.match(/data: (.+)/);

          if (eventMatch && dataMatch) {
            const event = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            if (event === 'progress' && onProgress) {
              onProgress(data as ProvisionProgress);
            } else if (event === 'error') {
              throw new Error(data.message);
            } else if (event === 'complete') {
              // Refresh templates to get updated status
              await fetchTemplates();
            }
          }
        }
      }
    },
    [token, fetchTemplates]
  );

  const recreateTemplate = useCallback(
    async (
      templateId: string,
      onProgress?: (progress: ProvisionProgress) => void
    ): Promise<void> => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/templates/${templateId}/recreate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok && !response.headers.get('content-type')?.includes('text/event-stream')) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to recreate template');
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventMatch = line.match(/event: (\w+)/);
          const dataMatch = line.match(/data: (.+)/);

          if (eventMatch && dataMatch) {
            const event = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            if (event === 'progress' && onProgress) {
              onProgress(data as ProvisionProgress);
            } else if (event === 'error') {
              throw new Error(data.message);
            } else if (event === 'complete') {
              // Refresh templates to get updated status
              await fetchTemplates();
            }
          }
        }
      }
    },
    [token, fetchTemplates]
  );

  // Auto-fetch on mount
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    isLoading,
    error,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    provisionTemplate,
    recreateTemplate,
  };
}

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import type { ProxmoxTemplate, TemplateStatus } from '@/lib/db/schema';

export interface CreateTemplateInput {
  name: string;
  description?: string;
  techStacks?: string[];
  isDefault?: boolean;
  parentTemplateId?: string; // Clone from this parent template
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

export interface LogEntry {
  type: 'stdout' | 'stderr';
  content: string;
  timestamp: number;
}

// Track active provisioning streams per template
const activeProvisionStreams = new Map<string, AbortController>();

// Maximum number of log entries to keep in memory
const MAX_LOG_ENTRIES = 1000;

export function useTemplates() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<ProxmoxTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track which templates are currently provisioning (for polling)
  const [provisioningTemplates, setProvisioningTemplates] = useState<Set<string>>(new Set());
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Installation logs
  const [provisionLogs, setProvisionLogs] = useState<LogEntry[]>([]);

  // Clear logs (call when starting new provisioning)
  const clearProvisionLogs = useCallback(() => {
    setProvisionLogs([]);
  }, []);

  // Add log entry with limit
  const addLogEntry = useCallback((entry: LogEntry) => {
    setProvisionLogs((prev) => {
      const next = [...prev, entry];
      // Keep only the last MAX_LOG_ENTRIES
      if (next.length > MAX_LOG_ENTRIES) {
        return next.slice(-MAX_LOG_ENTRIES);
      }
      return next;
    });
  }, []);

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
      options?: { storage?: string; node?: string; staging?: boolean },
      onProgress?: (progress: ProvisionProgress) => void,
      onStaging?: (result: { vmid: number; containerIp: string }) => void,
      onLog?: (entry: LogEntry) => void
    ): Promise<void> => {
      if (!token) throw new Error('Not authenticated');

      // Clear previous logs when starting new provisioning
      clearProvisionLogs();

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
            } else if (event === 'log') {
              const logEntry = data as LogEntry;
              addLogEntry(logEntry);
              onLog?.(logEntry);
            } else if (event === 'error') {
              throw new Error(data.message);
            } else if (event === 'staging' && onStaging) {
              // Template is in staging mode - refresh and notify
              await fetchTemplates();
              onStaging({ vmid: data.vmid, containerIp: data.containerIp });
            } else if (event === 'complete') {
              // Refresh templates to get updated status
              await fetchTemplates();
            }
          }
        }
      }
    },
    [token, fetchTemplates, clearProvisionLogs, addLogEntry]
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

  /**
   * Start provisioning in the background without blocking
   * Returns immediately - use polling or the template status to track progress
   */
  const startProvisionInBackground = useCallback(
    (
      templateId: string,
      options?: { storage?: string; node?: string; staging?: boolean },
      onProgress?: (progress: ProvisionProgress) => void,
      onComplete?: () => void,
      onError?: (error: Error) => void,
      onStaging?: (result: { vmid: number; containerIp: string }) => void,
      onLog?: (entry: LogEntry) => void
    ): void => {
      if (!token) {
        onError?.(new Error('Not authenticated'));
        return;
      }

      // Clear previous logs when starting new provisioning
      clearProvisionLogs();

      // Cancel any existing stream for this template
      const existingController = activeProvisionStreams.get(templateId);
      if (existingController) {
        existingController.abort();
      }

      // Create new abort controller
      const abortController = new AbortController();
      activeProvisionStreams.set(templateId, abortController);

      // Mark as provisioning
      setProvisioningTemplates((prev) => new Set(prev).add(templateId));

      // Start the fetch in background
      fetch(`/api/templates/${templateId}/provision`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options || {}),
        signal: abortController.signal,
      })
        .then(async (response) => {
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
                } else if (event === 'log') {
                  const logEntry = data as LogEntry;
                  addLogEntry(logEntry);
                  onLog?.(logEntry);
                } else if (event === 'error') {
                  throw new Error(data.message);
                } else if (event === 'staging' && onStaging) {
                  onStaging({ vmid: data.vmid, containerIp: data.containerIp });
                } else if (event === 'complete') {
                  onComplete?.();
                }
              }
            }
          }
        })
        .catch((err) => {
          if (err.name === 'AbortError') return; // Ignore abort errors
          console.error('Background provision error:', err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        })
        .finally(() => {
          activeProvisionStreams.delete(templateId);
          setProvisioningTemplates((prev) => {
            const next = new Set(prev);
            next.delete(templateId);
            return next;
          });
          // Always refresh templates to get final status
          fetchTemplates();
        });
    },
    [token, fetchTemplates, clearProvisionLogs, addLogEntry]
  );

  /**
   * Start recreation in the background without blocking
   */
  const startRecreateInBackground = useCallback(
    (
      templateId: string,
      onProgress?: (progress: ProvisionProgress) => void,
      onComplete?: () => void,
      onError?: (error: Error) => void
    ): void => {
      if (!token) {
        onError?.(new Error('Not authenticated'));
        return;
      }

      // Cancel any existing stream for this template
      const existingController = activeProvisionStreams.get(templateId);
      if (existingController) {
        existingController.abort();
      }

      // Create new abort controller
      const abortController = new AbortController();
      activeProvisionStreams.set(templateId, abortController);

      // Mark as provisioning
      setProvisioningTemplates((prev) => new Set(prev).add(templateId));

      // Start the fetch in background
      fetch(`/api/templates/${templateId}/recreate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        signal: abortController.signal,
      })
        .then(async (response) => {
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
                  onComplete?.();
                }
              }
            }
          }
        })
        .catch((err) => {
          if (err.name === 'AbortError') return; // Ignore abort errors
          console.error('Background recreate error:', err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        })
        .finally(() => {
          activeProvisionStreams.delete(templateId);
          setProvisioningTemplates((prev) => {
            const next = new Set(prev);
            next.delete(templateId);
            return next;
          });
          // Always refresh templates to get final status
          fetchTemplates();
        });
    },
    [token, fetchTemplates]
  );

  /**
   * Finalize a staging template (stop container and convert to template)
   */
  const finalizeTemplate = useCallback(
    async (
      templateId: string,
      onProgress?: (progress: ProvisionProgress) => void
    ): Promise<void> => {
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/templates/${templateId}/finalize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok && !response.headers.get('content-type')?.includes('text/event-stream')) {
        const { error } = await response.json();
        throw new Error(error?.message || 'Failed to finalize template');
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

  /**
   * Check if a specific template is currently provisioning
   */
  const isTemplateProvisioning = useCallback(
    (templateId: string): boolean => {
      return provisioningTemplates.has(templateId);
    },
    [provisioningTemplates]
  );

  // Auto-fetch on mount
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Poll for updates when any template is provisioning or has 'provisioning' status
  useEffect(() => {
    const hasProvisioningTemplates =
      provisioningTemplates.size > 0 ||
      templates.some((t) => t.status === 'provisioning');

    if (hasProvisioningTemplates && !pollingRef.current) {
      // Start polling every 3 seconds
      pollingRef.current = setInterval(() => {
        fetchTemplates();
      }, 3000);
    } else if (!hasProvisioningTemplates && pollingRef.current) {
      // Stop polling
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [provisioningTemplates, templates, fetchTemplates]);

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
    finalizeTemplate,
    // Background provisioning
    startProvisionInBackground,
    startRecreateInBackground,
    isTemplateProvisioning,
    provisioningTemplates,
    // Installation logs
    provisionLogs,
    clearProvisionLogs,
  };
}

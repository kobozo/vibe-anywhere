'use client';

import { useState, useEffect } from 'react';
import { LayoutPicker } from './LayoutPicker';
import { suggestLayout } from './types';
import type { TabGroupLayout } from '@/lib/db/schema';
import type { TabInfo } from '@/hooks/useTabs';

interface CreateGroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTabIds: Set<string>;
  tabs: TabInfo[];
  onCreate: (name: string, tabIds: string[], layout: TabGroupLayout) => Promise<void>;
  isLoading?: boolean;
}

export function CreateGroupDialog({
  isOpen,
  onClose,
  selectedTabIds,
  tabs,
  onCreate,
  isLoading = false,
}: CreateGroupDialogProps) {
  const [name, setName] = useState('');
  const [layout, setLayout] = useState<TabGroupLayout>('horizontal');
  const [error, setError] = useState<string | null>(null);

  const selectedTabs = tabs.filter(t => selectedTabIds.has(t.id));
  const tabCount = selectedTabIds.size;

  // Update layout suggestion when tab count changes
  useEffect(() => {
    setLayout(suggestLayout(tabCount));
  }, [tabCount]);

  // Generate default name
  useEffect(() => {
    if (selectedTabs.length >= 2) {
      const firstTwo = selectedTabs.slice(0, 2).map(t => t.name);
      setName(`${firstTwo.join(' + ')}${selectedTabs.length > 2 ? '...' : ''}`);
    }
  }, [selectedTabs]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (tabCount < 2) {
      setError('Select at least 2 tabs');
      return;
    }

    if (tabCount > 4) {
      setError('Maximum 4 tabs per group');
      return;
    }

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      await onCreate(name.trim(), Array.from(selectedTabIds), layout);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold mb-4">Create Tab Group</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selected tabs preview */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground-secondary">
              Selected Tabs ({tabCount})
            </label>
            <div className="flex flex-wrap gap-2">
              {selectedTabs.map(tab => (
                <span
                  key={tab.id}
                  className="px-2 py-1 text-sm bg-background-secondary rounded"
                >
                  {tab.name}
                </span>
              ))}
            </div>
          </div>

          {/* Name input */}
          <div className="space-y-2">
            <label htmlFor="group-name" className="text-sm font-medium text-foreground-secondary">
              Group Name
            </label>
            <input
              id="group-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter group name"
              className="w-full px-3 py-2 bg-background-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            />
          </div>

          {/* Layout picker */}
          <LayoutPicker
            selectedLayout={layout}
            onSelectLayout={setLayout}
            tabCount={tabCount}
            disabled={isLoading}
          />

          {/* Error message */}
          {error && (
            <p className="text-sm text-error">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-foreground-secondary hover:text-foreground bg-background-secondary rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || tabCount < 2}
              className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

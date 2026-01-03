'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRepositories } from '@/hooks/useRepositories';

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isGitRepo: boolean;
}

interface FolderPickerProps {
  onSelect: (path: string, folderName: string) => void;
  selectedPath?: string;
  gitReposOnly?: boolean;
}

export function FolderPicker({ onSelect, selectedPath, gitReposOnly = false }: FolderPickerProps) {
  const { browseDirectories } = useRepositories();
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (path?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await browseDirectories(path);
      setCurrentPath(result.currentPath);
      setParentPath(result.parentPath);

      // Filter to git repos only if requested
      let filteredEntries = result.entries;
      if (gitReposOnly) {
        filteredEntries = result.entries.filter(e => e.isGitRepo || e.isDirectory);
      }

      setEntries(filteredEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setIsLoading(false);
    }
  }, [browseDirectories, gitReposOnly]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const handleNavigate = (path: string) => {
    loadDirectory(path);
  };

  const handleSelect = (entry: DirectoryEntry) => {
    if (entry.isGitRepo) {
      onSelect(entry.path, entry.name);
    } else {
      handleNavigate(entry.path);
    }
  };

  return (
    <div className="border border-gray-600 rounded bg-gray-700/50">
      {/* Current path breadcrumb */}
      <div className="px-3 py-2 border-b border-gray-600 flex items-center gap-2">
        <span className="text-gray-400 text-sm">📁</span>
        <span className="text-sm text-gray-300 truncate">{currentPath}</span>
      </div>

      {/* Navigation */}
      {parentPath && (
        <button
          onClick={() => handleNavigate(parentPath)}
          className="w-full px-3 py-2 text-left text-sm text-gray-400 hover:bg-gray-700/50 flex items-center gap-2 border-b border-gray-600"
        >
          <span>⬆️</span>
          <span>..</span>
        </button>
      )}

      {/* Entries */}
      <div className="max-h-60 overflow-y-auto">
        {isLoading && (
          <div className="px-3 py-4 text-center text-gray-500 text-sm">Loading...</div>
        )}

        {error && (
          <div className="px-3 py-4 text-center text-red-400 text-sm">{error}</div>
        )}

        {!isLoading && entries.length === 0 && (
          <div className="px-3 py-4 text-center text-gray-500 text-sm">
            {gitReposOnly ? 'No git repositories found' : 'No folders found'}
          </div>
        )}

        {entries.map((entry) => (
          <button
            key={entry.path}
            onClick={() => handleSelect(entry)}
            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-700/50
              ${selectedPath === entry.path ? 'bg-blue-600/20 text-blue-400' : 'text-gray-300'}
              ${entry.isGitRepo ? 'cursor-pointer' : 'cursor-pointer'}`}
          >
            <span>{entry.isGitRepo ? '📦' : '📁'}</span>
            <span className="flex-1 truncate">{entry.name}</span>
            {entry.isGitRepo && (
              <span className="text-xs text-green-400 px-1.5 py-0.5 bg-green-400/10 rounded">
                git
              </span>
            )}
            {!entry.isGitRepo && (
              <span className="text-gray-500">→</span>
            )}
          </button>
        ))}
      </div>

      {/* Selected path indicator */}
      {selectedPath && (
        <div className="px-3 py-2 border-t border-gray-600 bg-blue-600/10">
          <span className="text-xs text-blue-400">Selected: </span>
          <span className="text-xs text-gray-300">{selectedPath}</span>
        </div>
      )}
    </div>
  );
}

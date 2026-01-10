'use client';

import { useState } from 'react';

interface CreateSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, repoPath: string, description?: string, aiArgs?: string) => Promise<void>;
  isLoading: boolean;
}

export function CreateSessionDialog({
  isOpen,
  onClose,
  onCreate,
  isLoading,
}: CreateSessionDialogProps) {
  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [description, setDescription] = useState('');
  const [aiArgs, setAiArgs] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!repoPath.trim()) {
      setError('Repository path is required');
      return;
    }

    try {
      await onCreate(name.trim(), repoPath.trim(), description.trim() || undefined, aiArgs.trim() || undefined);
      setName('');
      setRepoPath('');
      setDescription('');
      setAiArgs('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    }
  };

  const handleClose = () => {
    setName('');
    setRepoPath('');
    setDescription('');
    setAiArgs('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-md mx-4 shadow-xl">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Create New Session</h3>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                Session Name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Implement login feature"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="repoPath" className="block text-sm font-medium text-gray-300 mb-1">
                Repository Path *
              </label>
              <input
                id="repoPath"
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="/home/user/my-project"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Absolute path to the git repository on the server
              </p>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">
                Description (optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this session will work on..."
                rows={3}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label htmlFor="aiArgs" className="block text-sm font-medium text-gray-300 mb-1">
                AI Arguments (optional)
              </label>
              <input
                id="aiArgs"
                type="text"
                value={aiArgs}
                onChange={(e) => setAiArgs(e.target.value)}
                placeholder='e.g., -p "Focus on refactoring" --model sonnet'
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave empty for default. Arguments are passed to the AI command.
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded">{error}</div>
            )}
          </div>

          <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

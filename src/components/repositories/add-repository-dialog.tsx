'use client';

import { useState, useEffect } from 'react';
import { FolderPicker } from './folder-picker';
import { useSSHKeys, SSHKeyInfo } from '@/hooks/useSSHKeys';

interface AddRepositoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddLocal: (name: string, path: string, description?: string) => Promise<void>;
  onClone: (name: string, url: string, description?: string, sshKeyId?: string) => Promise<void>;
  isLoading: boolean;
}

type TabType = 'local' | 'clone';

export function AddRepositoryDialog({
  isOpen,
  onClose,
  onAddLocal,
  onClone,
  isLoading,
}: AddRepositoryDialogProps) {
  const { keys, fetchKeys } = useSSHKeys();
  const [activeTab, setActiveTab] = useState<TabType>('local');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Fetch SSH keys when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchKeys();
    }
  }, [isOpen, fetchKeys]);

  // Auto-select default key
  useEffect(() => {
    const defaultKey = keys.find(k => k.isDefault);
    if (defaultKey && !selectedKeyId) {
      setSelectedKeyId(defaultKey.id);
    }
  }, [keys, selectedKeyId]);

  if (!isOpen) return null;

  const isSSHUrl = cloneUrl.startsWith('git@') || cloneUrl.includes('ssh://');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (activeTab === 'local') {
        if (!selectedPath) {
          setError('Please select a folder');
          return;
        }
        await onAddLocal(name, selectedPath, description || undefined);
      } else {
        if (!cloneUrl) {
          setError('Please enter a clone URL');
          return;
        }
        // Only pass SSH key for SSH URLs
        const keyId = isSSHUrl ? selectedKeyId || undefined : undefined;
        await onClone(name, cloneUrl, description || undefined, keyId);
      }

      // Reset form
      setName('');
      setDescription('');
      setSelectedPath('');
      setCloneUrl('');
      setSelectedKeyId('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add repository');
    }
  };

  const handlePathSelect = (path: string, folderName: string) => {
    setSelectedPath(path);
    if (!name) {
      setName(folderName);
    }
  };

  // Auto-extract name from clone URL
  const handleCloneUrlChange = (url: string) => {
    setCloneUrl(url);
    if (!name) {
      // Extract repo name from URL
      const match = url.match(/\/([^\/]+?)(\.git)?$/);
      if (match) {
        setName(match[1]);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Add Repository</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => setActiveTab('local')}
              className={`px-3 py-1.5 text-sm rounded transition-colors
                ${activeTab === 'local'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
                }`}
            >
              Local Folder
            </button>
            <button
              onClick={() => setActiveTab('clone')}
              className={`px-3 py-1.5 text-sm rounded transition-colors
                ${activeTab === 'clone'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
                }`}
            >
              Clone from URL
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-600/20 border border-red-600/50 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          {activeTab === 'local' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Select Folder
                </label>
                <FolderPicker
                  onSelect={handlePathSelect}
                  selectedPath={selectedPath}
                  gitReposOnly
                />
              </div>
            </div>
          )}

          {activeTab === 'clone' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Repository URL
                </label>
                <input
                  type="text"
                  value={cloneUrl}
                  onChange={(e) => handleCloneUrlChange(e.target.value)}
                  placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                />
              </div>

              {/* SSH Key selection - only show for SSH URLs */}
              {isSSHUrl && (
                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    SSH Key
                  </label>
                  {keys.length > 0 ? (
                    <select
                      value={selectedKeyId}
                      onChange={(e) => setSelectedKeyId(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    >
                      <option value="">Select SSH key...</option>
                      {keys.map((key) => (
                        <option key={key.id} value={key.id}>
                          {key.name} ({key.keyType}){key.isDefault ? ' - default' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-yellow-600/20 border border-yellow-600/50 rounded text-yellow-400 text-sm">
                      No SSH keys found. Generate one in the sidebar to use SSH cloning.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              required
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !name || (activeTab === 'local' ? !selectedPath : !cloneUrl)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white transition-colors"
          >
            {isLoading ? 'Adding...' : 'Add Repository'}
          </button>
        </div>
      </div>
    </div>
  );
}

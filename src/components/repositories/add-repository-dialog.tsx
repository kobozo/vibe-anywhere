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
  const { keys, fetchKeys, generateKey } = useSSHKeys();
  const [activeTab, setActiveTab] = useState<TabType>('local');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // SSH key generation state
  const [showGenerateKey, setShowGenerateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyType, setNewKeyType] = useState<'ed25519' | 'rsa' | 'ecdsa'>('ed25519');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<SSHKeyInfo | null>(null);
  const [copied, setCopied] = useState(false);

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

  // Handle SSH key generation
  const handleGenerateKey = async () => {
    if (!newKeyName.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const key = await generateKey(newKeyName.trim(), newKeyType);
      setSelectedKeyId(key.id);
      setGeneratedKey(key);
      setNewKeyName('');
      setNewKeyType('ed25519');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate SSH key');
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy public key to clipboard
  const handleCopyPublicKey = async (publicKey?: string) => {
    const keyToCopy = publicKey || generatedKey?.publicKey;
    if (!keyToCopy) return;
    try {
      // Try modern clipboard API first
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(keyToCopy);
      } else {
        // Fallback for non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = keyToCopy;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Get the currently selected key
  const selectedKey = keys.find(k => k.id === selectedKeyId);

  // Dismiss the generated key success view
  const handleDismissGeneratedKey = () => {
    setGeneratedKey(null);
    setShowGenerateKey(false);
    setCopied(false);
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
                  {generatedKey ? (
                    /* Success state after key generation */
                    <div className="space-y-3">
                      <div className="p-3 bg-green-600/20 border border-green-600/50 rounded text-green-400 text-sm">
                        Key "{generatedKey.name}" generated successfully!
                      </div>
                      <div className="p-3 bg-gray-700/50 rounded space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Public Key (copy this to GitHub)</span>
                          <button
                            type="button"
                            onClick={() => handleCopyPublicKey()}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            {copied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <div className="font-mono text-xs text-gray-300 break-all bg-gray-900/50 p-2 rounded max-h-20 overflow-y-auto">
                          {generatedKey.publicKey}
                        </div>
                        <button
                          type="button"
                          onClick={handleDismissGeneratedKey}
                          className="w-full mt-2 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ) : keys.length > 0 ? (
                    <>
                      <select
                        value={selectedKeyId}
                        onChange={(e) => { setSelectedKeyId(e.target.value); setCopied(false); }}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                      >
                        <option value="">Select SSH key...</option>
                        {keys.map((key) => (
                          <option key={key.id} value={key.id}>
                            {key.name} ({key.keyType}){key.isDefault ? ' - default' : ''}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-3 mt-2">
                        {selectedKey && (
                          <button
                            type="button"
                            onClick={() => handleCopyPublicKey(selectedKey.publicKey)}
                            className="text-sm text-blue-400 hover:text-blue-300"
                          >
                            {copied ? 'Copied!' : 'Copy public key'}
                          </button>
                        )}
                        {!showGenerateKey && (
                          <button
                            type="button"
                            onClick={() => setShowGenerateKey(true)}
                            className="text-sm text-blue-400 hover:text-blue-300"
                          >
                            + Generate new key
                          </button>
                        )}
                      </div>
                      {showGenerateKey && (
                        <div className="mt-3 p-3 bg-gray-700/50 rounded space-y-3">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Key Name</label>
                            <input
                              type="text"
                              value={newKeyName}
                              onChange={(e) => setNewKeyName(e.target.value)}
                              placeholder="github-key"
                              className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <select
                              value={newKeyType}
                              onChange={(e) => setNewKeyType(e.target.value as 'ed25519' | 'rsa' | 'ecdsa')}
                              className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                            >
                              <option value="ed25519">Ed25519 (recommended)</option>
                              <option value="rsa">RSA 4096</option>
                              <option value="ecdsa">ECDSA</option>
                            </select>
                            <button
                              type="button"
                              onClick={handleGenerateKey}
                              disabled={isGenerating || !newKeyName.trim()}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-sm text-white"
                            >
                              {isGenerating ? 'Generating...' : 'Generate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowGenerateKey(false);
                                setNewKeyName('');
                              }}
                              className="text-sm text-gray-400 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-yellow-600/20 border border-yellow-600/50 rounded text-yellow-400 text-sm">
                        No SSH keys found. Generate one to use SSH cloning:
                      </div>
                      <div className="p-3 bg-gray-700/50 rounded space-y-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Key Name</label>
                          <input
                            type="text"
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            placeholder="github-key"
                            className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <select
                            value={newKeyType}
                            onChange={(e) => setNewKeyType(e.target.value as 'ed25519' | 'rsa' | 'ecdsa')}
                            className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                          >
                            <option value="ed25519">Ed25519 (recommended)</option>
                            <option value="rsa">RSA 4096</option>
                            <option value="ecdsa">ECDSA</option>
                          </select>
                          <button
                            type="button"
                            onClick={handleGenerateKey}
                            disabled={isGenerating || !newKeyName.trim()}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-sm text-white"
                          >
                            {isGenerating ? 'Generating...' : 'Generate'}
                          </button>
                        </div>
                      </div>
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

'use client';

import { useEffect, useState } from 'react';
import { useSSHKeys, SSHKeyInfo } from '@/hooks/useSSHKeys';

interface SSHKeyManagerProps {
  onKeySelect?: (key: SSHKeyInfo) => void;
}

export function SSHKeyManager({ onKeySelect }: SSHKeyManagerProps) {
  const { keys, isLoading, fetchKeys, generateKey, deleteKey, setDefaultKey } = useSSHKeys();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [keyType, setKeyType] = useState<'ed25519' | 'rsa' | 'ecdsa'>('ed25519');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleGenerate = async () => {
    if (!newKeyName.trim()) return;

    setIsGenerating(true);
    try {
      const key = await generateKey(newKeyName.trim(), keyType);
      setShowGenerateForm(false);
      setNewKeyName('');
      // Expand the new key to show the public key
      setExpandedKey(key.id);
    } catch (error) {
      console.error('Failed to generate key:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate key');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (keyId: string, keyName: string) => {
    if (!confirm(`Delete SSH key "${keyName}"?`)) return;

    try {
      await deleteKey(keyId);
    } catch (error) {
      console.error('Failed to delete key:', error);
    }
  };

  const handleCopyPublicKey = async (key: SSHKeyInfo) => {
    try {
      await navigator.clipboard.writeText(key.publicKey);
      setCopiedId(key.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="border-t border-gray-700 mt-4 pt-4">
      <div className="px-4 mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">SSH Keys</h3>
        <button
          onClick={() => setShowGenerateForm(!showGenerateForm)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {showGenerateForm ? 'Cancel' : '+ Generate'}
        </button>
      </div>

      {/* Generate form */}
      {showGenerateForm && (
        <div className="px-4 py-2 bg-gray-800/50 mb-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g., github-key)"
            className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 mb-2"
          />
          <div className="flex items-center gap-2 mb-2">
            <select
              value={keyType}
              onChange={(e) => setKeyType(e.target.value as 'ed25519' | 'rsa' | 'ecdsa')}
              className="flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
            >
              <option value="ed25519">Ed25519 (recommended)</option>
              <option value="rsa">RSA 4096</option>
              <option value="ecdsa">ECDSA</option>
            </select>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !newKeyName.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-sm text-white"
            >
              {isGenerating ? '...' : 'Generate'}
            </button>
          </div>
        </div>
      )}

      {/* Keys list */}
      <div className="px-2">
        {isLoading && keys.length === 0 && (
          <div className="text-gray-500 text-xs px-2 py-2">Loading keys...</div>
        )}

        {!isLoading && keys.length === 0 && !showGenerateForm && (
          <div className="text-gray-500 text-xs px-2 py-2">
            No SSH keys yet. Generate one to enable SSH cloning.
          </div>
        )}

        {keys.map((key) => (
          <div key={key.id} className="mb-1">
            <div
              onClick={() => setExpandedKey(expandedKey === key.id ? null : key.id)}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-700/50 group"
            >
              <span className="text-yellow-400 text-sm">🔑</span>
              <span className="flex-1 text-sm text-gray-300 truncate">{key.name}</span>
              {key.isDefault && (
                <span className="text-xs text-green-400 px-1 py-0.5 bg-green-400/10 rounded">
                  default
                </span>
              )}
              <span className="text-xs text-gray-500">{key.keyType}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(key.id, key.name);
                }}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 px-1"
              >
                ×
              </button>
            </div>

            {/* Expanded view with public key */}
            {expandedKey === key.id && (
              <div className="ml-6 mt-1 p-2 bg-gray-800/50 rounded text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-400">Public Key:</span>
                  <div className="flex gap-2">
                    {!key.isDefault && (
                      <button
                        onClick={() => setDefaultKey(key.id)}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => handleCopyPublicKey(key)}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      {copiedId === key.id ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="font-mono text-gray-300 break-all bg-gray-900/50 p-2 rounded max-h-20 overflow-y-auto">
                  {key.publicKey}
                </div>
                <div className="mt-2 text-gray-500">
                  Fingerprint: {key.fingerprint}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

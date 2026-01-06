'use client';

import { useState, useEffect } from 'react';
import { useOpenAISettings } from '@/hooks/useOpenAISettings';

interface VoiceSettingsProps {
  onSettingsChange?: () => void;
}

export function VoiceSettings({ onSettingsChange }: VoiceSettingsProps) {
  const { isConfigured, isLoading, error, fetchSettings, saveApiKey, removeApiKey } = useOpenAISettings();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!apiKey.trim()) return;

    setSaveError(null);
    setIsSaving(true);

    try {
      await saveApiKey(apiKey.trim());
      setApiKey('');
      onSettingsChange?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Are you sure you want to remove the OpenAI API key? Voice dictation will be disabled.')) {
      return;
    }

    setSaveError(null);
    setIsSaving(true);

    try {
      await removeApiKey();
      onSettingsChange?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to remove API key');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-400">
          Configure OpenAI API key to enable voice dictation using Whisper.
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Press Ctrl+M or click the microphone button to record and transcribe voice to text.
        </p>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 p-3 bg-gray-700/30 rounded">
        <span className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-green-500' : 'bg-gray-500'}`} />
        <span className="text-sm text-gray-300">
          {isLoading ? 'Checking...' : isConfigured ? 'Voice dictation enabled' : 'Voice dictation not configured'}
        </span>
      </div>

      {/* Error display */}
      {(error || saveError) && (
        <div className="p-3 bg-red-900/20 border border-red-600/30 rounded text-sm text-red-400">
          {saveError || error?.message}
        </div>
      )}

      {/* API Key input (only show if not configured) */}
      {!isConfigured && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">OpenAI API Key</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-300"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <button
                onClick={handleSave}
                disabled={!apiKey.trim() || isSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm text-white"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Get your API key from{' '}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              platform.openai.com/api-keys
            </a>
          </p>
        </div>
      )}

      {/* Remove button (only show if configured) */}
      {isConfigured && (
        <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded">
          <div>
            <span className="text-sm text-gray-300">OpenAI API Key</span>
            <span className="text-xs text-gray-500 ml-2">(stored securely)</span>
          </div>
          <button
            onClick={handleRemove}
            disabled={isSaving}
            className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 disabled:opacity-50 rounded text-sm text-red-400"
          >
            {isSaving ? 'Removing...' : 'Remove'}
          </button>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-gray-700/20 rounded">
        <h4 className="text-sm font-medium text-gray-300 mb-2">How to use voice dictation:</h4>
        <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
          <li>Select a terminal tab</li>
          <li>Press <kbd className="px-1 py-0.5 bg-gray-700 rounded text-gray-300">Ctrl+M</kbd> or click the microphone button</li>
          <li>Speak your command or text</li>
          <li>Press again to stop recording and transcribe</li>
          <li>The transcribed text will be typed into the terminal</li>
        </ol>
      </div>
    </div>
  );
}

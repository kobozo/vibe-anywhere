'use client';

import { useState, useEffect } from 'react';
import { useTailscaleSettings } from '@/hooks/useTailscaleSettings';

interface TailscaleSettingsProps {
  onSettingsChange?: () => void;
}

export function TailscaleSettings({ onSettingsChange }: TailscaleSettingsProps) {
  const {
    isConfigured,
    isLoading,
    error,
    fetchSettings,
    testConnection,
    saveOAuthToken,
    removeOAuthToken,
  } = useTailscaleSettings();

  const [oauthToken, setOAuthToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleTest = async () => {
    if (!oauthToken.trim()) return;

    setSaveError(null);
    setTestResult(null);
    setIsTesting(true);

    try {
      await testConnection(oauthToken.trim());
      setTestResult({ success: true, message: 'Connection successful!' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setTestResult({ success: false, message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!oauthToken.trim()) return;

    setSaveError(null);
    setTestResult(null);
    setIsSaving(true);

    try {
      await saveOAuthToken(oauthToken.trim());
      setOAuthToken('');
      onSettingsChange?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save OAuth token');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (
      !confirm(
        'Are you sure you want to remove the Tailscale OAuth token? Workspaces will not be able to join your tailnet.'
      )
    ) {
      return;
    }

    setSaveError(null);
    setTestResult(null);
    setIsSaving(true);

    try {
      await removeOAuthToken();
      onSettingsChange?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to remove OAuth token');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-foreground-secondary">
          Configure Tailscale OAuth token to enable workspaces to join your tailnet for secure
          Chrome browser control via MCP.
        </p>
        <p className="text-xs text-foreground-tertiary mt-1">
          OAuth tokens are used to generate ephemeral auth keys for each workspace.
        </p>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 p-3 bg-background-tertiary/30 rounded">
        <span
          className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-success' : 'bg-foreground-tertiary'}`}
        />
        <span className="text-sm text-foreground">
          {isLoading ? 'Checking...' : isConfigured ? 'Tailscale configured' : 'Tailscale not configured'}
        </span>
      </div>

      {/* Error display */}
      {(error || saveError) && (
        <div className="p-3 bg-error/20 border border-error/30 rounded text-sm text-error">
          {saveError || error?.message}
        </div>
      )}

      {/* Test result display */}
      {testResult && (
        <div
          className={`p-3 border rounded text-sm ${
            testResult.success
              ? 'bg-success/20 border-success/30 text-success'
              : 'bg-error/20 border-error/30 text-error'
          }`}
        >
          {testResult.message}
        </div>
      )}

      {/* OAuth Token input (only show if not configured) */}
      {!isConfigured && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-foreground-secondary mb-1">Tailscale OAuth Token</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={oauthToken}
                  onChange={(e) => {
                    setOAuthToken(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="tskey-..."
                  className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground placeholder-foreground-tertiary pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-foreground-secondary hover:text-foreground"
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
              <button
                onClick={handleTest}
                disabled={!oauthToken.trim() || isTesting || isSaving}
                className="px-4 py-2 bg-background-tertiary hover:bg-background-input disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-foreground border border-border-secondary"
              >
                {isTesting ? 'Testing...' : 'Test'}
              </button>
              <button
                onClick={handleSave}
                disabled={!oauthToken.trim() || isSaving || isTesting}
                className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-foreground"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <p className="text-xs text-foreground-tertiary">
            Generate an OAuth token from{' '}
            <a
              href="https://login.tailscale.com/admin/settings/oauth"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline"
            >
              login.tailscale.com/admin/settings/oauth
            </a>
          </p>
        </div>
      )}

      {/* Remove button (only show if configured) */}
      {isConfigured && (
        <div className="flex items-center justify-between p-3 bg-background-tertiary/30 rounded">
          <div>
            <span className="text-sm text-foreground">Tailscale OAuth Token</span>
            <span className="text-xs text-foreground-tertiary ml-2">(stored securely)</span>
          </div>
          <button
            onClick={handleRemove}
            disabled={isSaving}
            className="px-3 py-1.5 bg-error/20 hover:bg-error/40 disabled:opacity-50 rounded text-sm text-error"
          >
            {isSaving ? 'Removing...' : 'Remove'}
          </button>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-background-tertiary/20 rounded">
        <h4 className="text-sm font-medium text-foreground mb-2">How to set up Tailscale:</h4>
        <ol className="text-xs text-foreground-secondary space-y-1 list-decimal list-inside">
          <li>
            Create an OAuth client at{' '}
            <a
              href="https://login.tailscale.com/admin/settings/oauth"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline"
            >
              Tailscale Admin Console
            </a>
          </li>
          <li>Grant the OAuth client <kbd className="px-1 py-0.5 bg-background-tertiary rounded text-foreground">Write</kbd> permission for <kbd className="px-1 py-0.5 bg-background-tertiary rounded text-foreground">Devices</kbd></li>
          <li>Copy the generated OAuth token (starts with <code className="px-1 py-0.5 bg-background-tertiary rounded text-foreground">tskey-</code>)</li>
          <li>Paste it above and click Test to verify, then Save</li>
          <li>
            For Chrome MCP setup, see{' '}
            <a
              href="/docs/CHROME-MCP-SETUP.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline"
            >
              Chrome MCP Setup Guide
            </a>
          </li>
        </ol>
      </div>
    </div>
  );
}

'use client';

import { useState, useCallback, useRef, useMemo } from 'react';

export interface EnvVar {
  key: string;
  value: string;
  encrypted: boolean;
}

interface EnvVarEditorProps {
  envVars: EnvVar[];
  onChange: (envVars: EnvVar[]) => void;
  disabled?: boolean;
  inheritedVars?: Record<string, string>; // Show template vars (read-only)
}

// Patterns for auto-detecting sensitive environment variables
const SENSITIVE_KEY_PATTERN = /SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE|CREDENTIAL|AUTH/i;

// Parse .env file content into EnvVar array
function parseEnvContent(content: string): EnvVar[] {
  const lines = content.split('\n');
  const vars: EnvVar[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match KEY=value pattern (key must be valid env var name)
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      const [, key, rawValue] = match;
      // Remove surrounding quotes if present
      let value = rawValue;
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Auto-detect sensitive keys
      const encrypted = SENSITIVE_KEY_PATTERN.test(key);

      vars.push({ key, value, encrypted });
    }
  }

  return vars;
}

export function EnvVarEditor({
  envVars,
  onChange,
  disabled = false,
  inheritedVars = {},
}: EnvVarEditorProps) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newEncrypted, setNewEncrypted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bulk import state
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkContent, setBulkContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse bulk content for preview
  const parsedPreview = useMemo(() => {
    if (!bulkContent.trim()) return [];
    return parseEnvContent(bulkContent);
  }, [bulkContent]);

  // Validate key format
  const isValidKey = (key: string): boolean => {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
  };

  // Handle adding a new env var
  const handleAdd = useCallback(() => {
    setError(null);

    if (!newKey.trim()) {
      setError('Key is required');
      return;
    }

    if (!isValidKey(newKey)) {
      setError('Key must start with a letter or underscore and contain only alphanumeric characters and underscores');
      return;
    }

    // Check for duplicates
    if (envVars.some(e => e.key === newKey)) {
      setError(`Key "${newKey}" already exists`);
      return;
    }

    onChange([...envVars, { key: newKey, value: newValue, encrypted: newEncrypted }]);
    setNewKey('');
    setNewValue('');
    setNewEncrypted(false);
  }, [newKey, newValue, newEncrypted, envVars, onChange]);

  // Handle removing an env var
  const handleRemove = useCallback((key: string) => {
    onChange(envVars.filter(e => e.key !== key));
  }, [envVars, onChange]);

  // Handle updating an env var value
  const handleUpdateValue = useCallback((key: string, value: string) => {
    onChange(envVars.map(e => e.key === key ? { ...e, value } : e));
  }, [envVars, onChange]);

  // Handle toggling encryption for an env var
  const handleToggleEncrypted = useCallback((key: string) => {
    onChange(envVars.map(e => e.key === key ? { ...e, encrypted: !e.encrypted } : e));
  }, [envVars, onChange]);

  // Check if a key is inherited from template
  const isInherited = (key: string): boolean => {
    return key in inheritedVars;
  };

  // Merge new env vars with existing ones (updates duplicates)
  const mergeEnvVars = useCallback((newVars: EnvVar[]) => {
    const merged = [...envVars];
    for (const newVar of newVars) {
      const existingIdx = merged.findIndex(v => v.key === newVar.key);
      if (existingIdx >= 0) {
        merged[existingIdx] = newVar;
      } else {
        merged.push(newVar);
      }
    }
    onChange(merged);
  }, [envVars, onChange]);

  // Handle file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseEnvContent(content);
      if (parsed.length > 0) {
        mergeEnvVars(parsed);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset for re-upload
  }, [mergeEnvVars]);

  // Apply bulk import
  const handleApplyBulkImport = useCallback(() => {
    if (parsedPreview.length > 0) {
      mergeEnvVars(parsedPreview);
      setBulkContent('');
      setShowBulkImport(false);
    }
  }, [parsedPreview, mergeEnvVars]);

  // Cancel bulk import
  const handleCancelBulkImport = useCallback(() => {
    setBulkContent('');
    setShowBulkImport(false);
  }, []);

  const inheritedKeys = Object.keys(inheritedVars);

  // Count how many vars will be encrypted in preview
  const encryptedCount = parsedPreview.filter(v => v.encrypted).length;

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 text-sm">
            <p className="text-foreground font-medium mb-1">Environment variables are automatically synced</p>
            <p className="text-foreground-secondary">
              Changes are applied immediately to new terminal sessions. To load changes in your current shell, run:{' '}
              <code className="px-1.5 py-0.5 bg-background-tertiary text-foreground rounded font-mono text-xs">
                reload-env
              </code>
            </p>
          </div>
        </div>
      </div>

      {/* Import actions bar */}
      {!disabled && (
        <div className="flex items-center gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".env,.env.*,text/plain"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Import .env button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-foreground-secondary hover:text-foreground bg-background-tertiary hover:bg-background-input border border-border-secondary rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import .env
          </button>

          {/* Bulk import toggle */}
          <button
            type="button"
            onClick={() => setShowBulkImport(!showBulkImport)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded transition-colors ${
              showBulkImport
                ? 'text-primary bg-primary/10 border-primary/30'
                : 'text-foreground-secondary hover:text-foreground bg-background-tertiary hover:bg-background-input border-border-secondary'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Bulk Import
            <svg className={`w-3 h-3 transition-transform ${showBulkImport ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* Bulk import section */}
      {showBulkImport && !disabled && (
        <div className="p-3 bg-background-tertiary/50 rounded border border-border-secondary space-y-3">
          <div className="text-sm text-foreground-secondary">Paste .env content:</div>
          <textarea
            value={bulkContent}
            onChange={(e) => setBulkContent(e.target.value)}
            placeholder={`# Paste your .env file content here\nDATABASE_URL=postgres://...\nAPI_KEY=sk-abc123\nDEBUG=true`}
            className="w-full h-32 px-3 py-2 bg-background-tertiary border border-border-secondary rounded text-sm font-mono text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {/* Preview */}
          {parsedPreview.length > 0 && (
            <div className="text-sm text-foreground-secondary">
              <span className="text-foreground">{parsedPreview.length}</span> variable{parsedPreview.length !== 1 ? 's' : ''} detected
              {encryptedCount > 0 && (
                <span className="text-warning ml-1">
                  ({encryptedCount} will be encrypted)
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelBulkImport}
              className="px-3 py-1.5 text-sm text-foreground-secondary hover:text-foreground bg-background-tertiary border border-border-secondary rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyBulkImport}
              disabled={parsedPreview.length === 0}
              className="px-3 py-1.5 text-sm bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 rounded text-primary-foreground transition-colors"
            >
              Apply {parsedPreview.length > 0 && `(${parsedPreview.length})`}
            </button>
          </div>
        </div>
      )}

      {/* Inherited variables info */}
      {inheritedKeys.length > 0 && (
        <div className="p-3 bg-background-tertiary/30 rounded border border-border-secondary">
          <div className="text-xs text-foreground-secondary mb-2">
            Inherited from template ({inheritedKeys.length} variable{inheritedKeys.length !== 1 ? 's' : ''}):
          </div>
          <div className="flex flex-wrap gap-2">
            {inheritedKeys.map(key => (
              <span
                key={key}
                className="px-2 py-0.5 bg-background-input text-foreground-secondary text-xs rounded"
              >
                {key}
              </span>
            ))}
          </div>
          <p className="text-xs text-foreground-tertiary mt-2">
            Add a variable with the same key to override the inherited value.
          </p>
        </div>
      )}

      {/* Existing env vars list */}
      <div className="space-y-2">
        {envVars.map((envVar) => (
          <div
            key={envVar.key}
            className="flex items-center gap-2 p-2 bg-background-tertiary/30 rounded group"
          >
            {/* Key */}
            <div className="w-1/3 min-w-0">
              <input
                type="text"
                value={envVar.key}
                disabled
                className="w-full px-2 py-1 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground font-mono disabled:opacity-70"
              />
            </div>

            {/* Value */}
            <div className="flex-1 min-w-0">
              <input
                type={envVar.encrypted ? 'password' : 'text'}
                value={envVar.value}
                onChange={(e) => handleUpdateValue(envVar.key, e.target.value)}
                disabled={disabled}
                placeholder={envVar.encrypted ? '(encrypted)' : 'Value'}
                className="w-full px-2 py-1 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground font-mono disabled:opacity-50"
              />
            </div>

            {/* Encrypted toggle */}
            <button
              type="button"
              onClick={() => handleToggleEncrypted(envVar.key)}
              disabled={disabled}
              className={`p-1.5 rounded transition-colors ${
                envVar.encrypted
                  ? 'text-warning bg-warning/20 hover:bg-warning/30'
                  : 'text-foreground-tertiary hover:text-foreground-secondary hover:bg-background-input'
              } disabled:opacity-50`}
              title={envVar.encrypted ? 'Encrypted (click to show in plain text)' : 'Plain text (click to encrypt)'}
            >
              {envVar.encrypted ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              )}
            </button>

            {/* Override indicator */}
            {isInherited(envVar.key) && (
              <span className="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded whitespace-nowrap">
                override
              </span>
            )}

            {/* Delete button */}
            <button
              type="button"
              onClick={() => handleRemove(envVar.key)}
              disabled={disabled}
              className="opacity-0 group-hover:opacity-100 text-foreground-tertiary hover:text-error p-1 disabled:opacity-50 transition-opacity"
              title="Remove"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {envVars.length === 0 && (
          <div className="text-sm text-foreground-tertiary py-4 text-center">
            No environment variables defined. Add one below.
          </div>
        )}
      </div>

      {/* Add new env var form */}
      <div className="p-3 bg-background-tertiary/50 rounded space-y-3">
        <div className="text-sm text-foreground-secondary">Add New Variable</div>

        <div className="flex items-start gap-2">
          {/* Key input */}
          <div className="w-1/3 min-w-0">
            <input
              type="text"
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value.toUpperCase().replace(/[^A-Za-z0-9_]/g, '_'));
                setError(null);
              }}
              disabled={disabled}
              placeholder="KEY_NAME"
              className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground font-mono disabled:opacity-50"
            />
          </div>

          {/* Value input */}
          <div className="flex-1 min-w-0">
            <input
              type={newEncrypted ? 'password' : 'text'}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              disabled={disabled}
              placeholder="value"
              className="w-full px-2 py-1.5 bg-background-tertiary border border-border-secondary rounded text-sm text-foreground font-mono disabled:opacity-50"
            />
          </div>

          {/* Encrypted toggle */}
          <button
            type="button"
            onClick={() => setNewEncrypted(!newEncrypted)}
            disabled={disabled}
            className={`p-1.5 rounded transition-colors ${
              newEncrypted
                ? 'text-warning bg-warning/20 hover:bg-warning/30'
                : 'text-foreground-tertiary hover:text-foreground-secondary hover:bg-background-input'
            } disabled:opacity-50`}
            title={newEncrypted ? 'Will be encrypted' : 'Will be stored as plain text'}
          >
            {newEncrypted ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          {/* Add button */}
          <button
            type="button"
            onClick={handleAdd}
            disabled={disabled || !newKey.trim()}
            className="px-3 py-1.5 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 rounded text-sm text-primary-foreground transition-colors"
          >
            Add
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="text-error text-xs">{error}</div>
        )}

        {/* Help text */}
        <p className="text-xs text-foreground-tertiary">
          Click the lock icon to encrypt sensitive values like API keys. Encrypted values are stored securely and cannot be viewed after saving.
        </p>
      </div>
    </div>
  );
}

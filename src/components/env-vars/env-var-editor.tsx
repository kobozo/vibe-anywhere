'use client';

import { useState, useCallback } from 'react';

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

  const inheritedKeys = Object.keys(inheritedVars);

  return (
    <div className="space-y-4">
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

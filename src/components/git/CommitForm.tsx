'use client';

import { useState, useCallback } from 'react';
import type { CommitResult } from '@/types/git';

interface CommitFormProps {
  stagedCount: number;
  onCommit: (message: string) => Promise<CommitResult | null>;
  isCommitting: boolean;
}

export function CommitForm({ stagedCount, onCommit, isCommitting }: CommitFormProps) {
  const [message, setMessage] = useState('');
  const [lastCommit, setLastCommit] = useState<CommitResult | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || stagedCount === 0 || isCommitting) {
      return;
    }

    const result = await onCommit(message);
    if (result) {
      setLastCommit(result);
      setMessage('');
    }
  }, [message, stagedCount, isCommitting, onCommit]);

  const canCommit = stagedCount > 0 && message.trim().length > 0 && !isCommitting;

  return (
    <form onSubmit={handleSubmit} className="p-3">
      {/* Last commit info */}
      {lastCommit && (
        <div className="mb-2 px-2 py-1.5 bg-success/20 rounded text-xs text-success flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>
            Committed: {lastCommit.hash.slice(0, 7)} - {lastCommit.message.slice(0, 50)}
            {lastCommit.message.length > 50 ? '...' : ''}
          </span>
        </div>
      )}

      {/* Commit message input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            stagedCount === 0
              ? 'Stage files to commit'
              : `Commit message (${stagedCount} file${stagedCount > 1 ? 's' : ''} staged)`
          }
          disabled={stagedCount === 0 || isCommitting}
          className="flex-1 bg-background-secondary border border-border-secondary rounded px-3 py-2 text-sm text-foreground placeholder-foreground-tertiary focus:outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canCommit}
          className="px-4 py-2 bg-success hover:bg-success/80 disabled:bg-background-tertiary disabled:text-foreground-tertiary text-success-foreground rounded text-sm font-medium transition-colors flex items-center gap-2"
        >
          {isCommitting ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Committing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Commit
            </>
          )}
        </button>
      </div>
    </form>
  );
}

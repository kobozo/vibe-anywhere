'use client';

import { useEffect, useState } from 'react';
import { useSessions } from '@/hooks/useSession';
import { SessionCard } from './session-card';
import { CreateSessionDialog } from './create-session-dialog';
import type { SessionInfo } from '@/types/session';

interface SessionListProps {
  onSelectSession: (session: SessionInfo | null) => void;
  selectedSessionId?: string | null;
}

export function SessionList({ onSelectSession, selectedSessionId }: SessionListProps) {
  const {
    sessions,
    isLoading,
    error,
    fetchSessions,
    createSession,
    startSession,
    deleteSession,
  } = useSessions();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
    // Refresh sessions periodically
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const handleCreate = async (name: string, repoPath: string, description?: string, claudeArgs?: string) => {
    try {
      setActionLoading('create');
      // Parse claudeArgs string into command array
      const claudeCommand = claudeArgs
        ? ['claude', ...parseArgs(claudeArgs)]
        : undefined;
      const session = await createSession({ name, repoPath, description, claudeCommand });
      setIsCreateDialogOpen(false);
      onSelectSession(session);
    } finally {
      setActionLoading(null);
    }
  };

  // Simple argument parser that handles quoted strings
  function parseArgs(argsString: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      args.push(current);
    }

    return args;
  }

  const handleStart = async (session: SessionInfo) => {
    try {
      setActionLoading(session.id);
      const started = await startSession(session.id);
      onSelectSession(started);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async (session: SessionInfo) => {
    try {
      setActionLoading(session.id);
      // API to stop session would go here
      await fetchSessions();
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (session: SessionInfo) => {
    if (!confirm(`Delete session "${session.name}"? This will remove the worktree and all changes.`)) {
      return;
    }

    try {
      setActionLoading(session.id);
      await deleteSession(session.id);
      if (selectedSessionId === session.id) {
        onSelectSession(null);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelect = (session: SessionInfo) => {
    if (session.status === 'running') {
      onSelectSession(session);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Sessions</h2>
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white transition-colors"
          >
            New Session
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && sessions.length === 0 && (
          <div className="text-center text-gray-400 py-8">Loading sessions...</div>
        )}

        {error && (
          <div className="text-center text-red-400 py-4">
            Failed to load sessions: {error.message}
          </div>
        )}

        {!isLoading && sessions.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <p>No sessions yet.</p>
            <p className="text-sm mt-2">Create a new session to get started.</p>
          </div>
        )}

        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onSelect={handleSelect}
            onStart={handleStart}
            onStop={handleStop}
            onDelete={handleDelete}
            isSelected={selectedSessionId === session.id}
          />
        ))}
      </div>

      <CreateSessionDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreate={handleCreate}
        isLoading={actionLoading === 'create'}
      />
    </div>
  );
}

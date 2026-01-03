'use client';

import { formatDistanceToNow } from 'date-fns';
import type { SessionInfo } from '@/types/session';
import { cn } from '@/lib/utils';

interface SessionCardProps {
  session: SessionInfo;
  onSelect: (session: SessionInfo) => void;
  onStart: (session: SessionInfo) => void;
  onStop: (session: SessionInfo) => void;
  onDelete: (session: SessionInfo) => void;
  isSelected?: boolean;
}

const statusColors: Record<string, string> = {
  pending: 'bg-gray-500',
  starting: 'bg-yellow-500 animate-pulse',
  running: 'bg-green-500',
  stopping: 'bg-yellow-500 animate-pulse',
  stopped: 'bg-gray-500',
  error: 'bg-red-500',
};

export function SessionCard({
  session,
  onSelect,
  onStart,
  onStop,
  onDelete,
  isSelected,
}: SessionCardProps) {
  const canStart = session.status === 'pending' || session.status === 'stopped';
  const canStop = session.status === 'running';
  const isRunning = session.status === 'running';

  return (
    <div
      className={cn(
        'p-4 rounded-lg border cursor-pointer transition-all',
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
      )}
      onClick={() => onSelect(session)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn('w-2 h-2 rounded-full', statusColors[session.status] || 'bg-gray-500')}
            />
            <h3 className="font-medium text-white truncate">{session.name}</h3>
          </div>
          {session.description && (
            <p className="mt-1 text-sm text-gray-400 truncate">{session.description}</p>
          )}
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span className="font-mono">{session.branchName}</span>
            <span>
              {formatDistanceToNow(new Date(session.lastActivityAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {canStart && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStart(session);
            }}
            className="px-3 py-1 text-xs bg-green-600 hover:bg-green-500 rounded text-white transition-colors"
          >
            Start
          </button>
        )}
        {canStop && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStop(session);
            }}
            className="px-3 py-1 text-xs bg-yellow-600 hover:bg-yellow-500 rounded text-white transition-colors"
          >
            Stop
          </button>
        )}
        {isRunning && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(session);
            }}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors"
          >
            Attach
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(session);
          }}
          className="px-3 py-1 text-xs bg-red-600/20 hover:bg-red-600/40 rounded text-red-400 transition-colors ml-auto"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

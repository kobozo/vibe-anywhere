'use client';

import { useState, useEffect } from 'react';
import type { UserAuditAction } from '@/lib/db/schema';

/**
 * Audit Log Panel Component
 *
 * Displays audit log of user management actions.
 * Shows timestamp, action, performed by, target user, and details.
 */

interface AuditLog {
  id: string;
  action: UserAuditAction;
  performedBy: string | null;
  targetUserId: string | null;
  targetUsername: string;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: Date;
}

interface AuditLogPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuditLogPanel({ isOpen, onClose }: AuditLogPanelProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<UserAuditAction | 'all'>('all');

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, filter]);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type: 'user_management' });
      if (filter !== 'all') {
        params.set('action', filter);
      }

      const response = await fetch(`/api/audit-log?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatActionName = (action: UserAuditAction): string => {
    const actionMap: Record<UserAuditAction, string> = {
      user_created: 'Created User',
      user_edited: 'Edited User',
      role_changed: 'Changed Role',
      password_reset: 'Reset Password',
      user_deleted: 'Deleted User',
      user_deactivated: 'Deactivated User',
    };
    return actionMap[action] || action;
  };

  const isDestructiveAction = (action: UserAuditAction): boolean => {
    return action === 'user_deleted';
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg shadow-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Audit Log</h2>
          <button
            onClick={onClose}
            className="text-foreground-secondary hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Filter Section */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <label htmlFor="action-filter" className="text-sm text-foreground-secondary">
              Filter by action:
            </label>
            <select
              id="action-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value as UserAuditAction | 'all')}
              className="px-3 py-1.5 text-sm bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Actions</option>
              <option value="user_created">User Created</option>
              <option value="role_changed">Role Changed</option>
              <option value="password_reset">Password Reset</option>
              <option value="user_deleted">User Deleted</option>
              <option value="user_deactivated">User Deactivated</option>
              <option value="user_edited">User Edited</option>
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="text-foreground-tertiary text-sm py-8 text-center">
              Loading audit logs...
            </div>
          )}

          {error && (
            <div className="text-error text-sm py-8 text-center">{error}</div>
          )}

          {!isLoading && !error && logs.length === 0 && (
            <div className="text-foreground-tertiary text-sm py-8 text-center">
              No audit logs found.
            </div>
          )}

          {!isLoading && !error && logs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-3 font-medium text-foreground-secondary">
                      Timestamp
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-foreground-secondary">
                      Action
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-foreground-secondary">
                      Performed By
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-foreground-secondary">
                      Target User
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-foreground-secondary">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-border hover:bg-background-tertiary">
                      <td className="py-3 px-3 text-foreground-secondary whitespace-nowrap">
                        {formatTimestamp(log.timestamp)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`${
                            isDestructiveAction(log.action)
                              ? 'text-error font-medium'
                              : 'text-foreground'
                          }`}
                        >
                          {formatActionName(log.action)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-foreground-secondary">
                        {log.performedBy || 'System'}
                      </td>
                      <td className="py-3 px-3 text-foreground">
                        {log.targetUsername}
                      </td>
                      <td className="py-3 px-3 text-foreground-secondary">
                        {log.details || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-between items-center">
          <p className="text-xs text-foreground-secondary">
            Showing last {logs.length} entries
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-background-tertiary hover:bg-background-tertiary/80 text-foreground rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

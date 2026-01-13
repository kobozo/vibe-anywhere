'use client';

import { useState, useEffect } from 'react';
import type { UserRole } from '@/lib/db/schema';
import { CreateUserDialog } from './create-user-dialog';
import { EditUserDialog } from './edit-user-dialog';
import { DeleteUserDialog } from './delete-user-dialog';
import { ChangeRoleDialog } from './change-role-dialog';
import { ResetPasswordDialog } from './reset-password-dialog';
import { AuditLogPanel } from './audit-log-panel';

/**
 * User Management Tab
 *
 * Main container for user management interface.
 * Displays list of all users with their roles, status, and actions.
 */

interface User {
  id: string;
  username: string;
  role: UserRole;
  forcePasswordChange: boolean;
  createdAt: number;
  updatedAt: number;
}

interface UserManagementTabProps {
  onUserCountChange?: (count: number) => void;
}

export function UserManagementTab({ onUserCountChange }: UserManagementTabProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isChangeRoleDialogOpen, setIsChangeRoleDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isAuditLogPanelOpen, setIsAuditLogPanelOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [resourceCount, setResourceCount] = useState({ repositories: 0, workspaces: 0 });

  // Fetch users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  // Notify parent of user count changes
  useEffect(() => {
    if (onUserCountChange) {
      onUserCountChange(users.length);
    }
  }, [users.length, onUserCountChange]);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/users');
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/20 text-red-400';
      case 'user-admin':
        return 'bg-orange-500/20 text-orange-400';
      case 'developer':
        return 'bg-blue-500/20 text-blue-400';
      case 'template-admin':
        return 'bg-purple-500/20 text-purple-400';
      case 'security-admin':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const formatRoleName = (role: UserRole) => {
    const roleMap: Record<UserRole, string> = {
      admin: 'Admin',
      'user-admin': 'User Admin',
      developer: 'Developer',
      'template-admin': 'Template Admin',
      'security-admin': 'Security Admin',
    };
    return roleMap[role] || role;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatus = (user: User) => {
    return user.forcePasswordChange ? 'Password Change Required' : 'Active';
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsEditDialogOpen(true);
  };

  const handleChangeRole = (user: User) => {
    setSelectedUser(user);
    setIsChangeRoleDialogOpen(true);
  };

  const handleResetPassword = (user: User) => {
    setSelectedUser(user);
    setIsResetPasswordDialogOpen(true);
  };

  const handleDelete = async (user: User) => {
    setSelectedUser(user);
    // Fetch resource count for the user
    try {
      const response = await fetch(`/api/users/${user.id}/resources`);
      if (response.ok) {
        const data = await response.json();
        setResourceCount({
          repositories: data.repositories || 0,
          workspaces: data.workspaces || 0,
        });
      } else {
        // If fetch fails, assume no resources
        setResourceCount({ repositories: 0, workspaces: 0 });
      }
    } catch (err) {
      console.error('Failed to fetch resource count:', err);
      setResourceCount({ repositories: 0, workspaces: 0 });
    }
    setIsDeleteDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-foreground-secondary">
            Manage user accounts, roles, and permissions.
          </p>
        </div>
        <div className="text-foreground-tertiary text-sm py-8 text-center">
          Loading users...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-foreground-secondary">
            Manage user accounts, roles, and permissions.
          </p>
        </div>
        <div className="text-error text-sm py-8 text-center">{error}</div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-foreground-secondary">
            Manage user accounts, roles, and permissions.
          </p>
        </div>
        <div className="text-foreground-tertiary text-sm py-8 text-center">
          No users found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground-secondary">
          Manage user accounts, roles, and permissions.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAuditLogPanelOpen(true)}
            className="px-3 py-1.5 text-sm bg-background-tertiary hover:bg-background-tertiary/80 text-foreground rounded transition-colors"
          >
            Audit Log
          </button>
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="px-3 py-1.5 text-sm bg-primary hover:bg-primary-hover text-foreground rounded transition-colors"
          >
            Create User
          </button>
        </div>
      </div>

      {/* User Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-3 font-medium text-foreground-secondary">
                Username
              </th>
              <th className="text-left py-3 px-3 font-medium text-foreground-secondary">
                Role
              </th>
              <th className="text-left py-3 px-3 font-medium text-foreground-secondary">
                Created Date
              </th>
              <th className="text-left py-3 px-3 font-medium text-foreground-secondary">
                Status
              </th>
              <th className="text-right py-3 px-3 font-medium text-foreground-secondary">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border hover:bg-background-tertiary">
                <td className="py-3 px-3 text-foreground">{user.username}</td>
                <td className="py-3 px-3">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(
                      user.role
                    )}`}
                  >
                    {formatRoleName(user.role)}
                  </span>
                </td>
                <td className="py-3 px-3 text-foreground-secondary">
                  {formatDate(user.createdAt)}
                </td>
                <td className="py-3 px-3 text-foreground-secondary">{getStatus(user)}</td>
                <td className="py-3 px-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleEdit(user)}
                      className="text-primary hover:text-primary-hover text-xs px-2 py-1 rounded hover:bg-background-tertiary transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleChangeRole(user)}
                      className="text-primary hover:text-primary-hover text-xs px-2 py-1 rounded hover:bg-background-tertiary transition-colors"
                    >
                      Change Role
                    </button>
                    <button
                      onClick={() => handleResetPassword(user)}
                      className="text-warning hover:text-warning-hover text-xs px-2 py-1 rounded hover:bg-background-tertiary transition-colors"
                    >
                      Reset Password
                    </button>
                    <button
                      onClick={() => handleDelete(user)}
                      className="text-error hover:text-error-hover text-xs px-2 py-1 rounded hover:bg-background-tertiary transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Dialog */}
      <CreateUserDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSuccess={fetchUsers}
      />

      {/* Edit User Dialog */}
      <EditUserDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSuccess={fetchUsers}
        user={selectedUser}
      />

      {/* Delete User Dialog */}
      <DeleteUserDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onSuccess={fetchUsers}
        user={selectedUser}
        resourceCount={resourceCount}
      />

      {/* Change Role Dialog */}
      <ChangeRoleDialog
        isOpen={isChangeRoleDialogOpen}
        onClose={() => setIsChangeRoleDialogOpen(false)}
        onSuccess={fetchUsers}
        user={selectedUser}
      />

      {/* Reset Password Dialog */}
      <ResetPasswordDialog
        isOpen={isResetPasswordDialogOpen}
        onClose={() => setIsResetPasswordDialogOpen(false)}
        onSuccess={fetchUsers}
        user={selectedUser}
      />

      {/* Audit Log Panel */}
      <AuditLogPanel
        isOpen={isAuditLogPanelOpen}
        onClose={() => setIsAuditLogPanelOpen(false)}
      />
    </div>
  );
}

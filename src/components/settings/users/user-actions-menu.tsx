'use client';

import { useEffect, useRef } from 'react';
import type { UserRole } from '@/lib/db/schema';

interface User {
  id: string;
  username: string;
  role: UserRole;
  forcePasswordChange: boolean;
  createdAt: number;
  updatedAt: number;
}

interface UserActionsMenuProps {
  user: User;
  onEdit: () => void;
  onChangeRole: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function UserActionsMenu({
  user,
  onEdit,
  onChangeRole,
  onResetPassword,
  onDelete,
  onClose,
}: UserActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const menuItemClass =
    'w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary flex items-center gap-2 transition-colors';

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 bg-background border border-border rounded-md shadow-lg z-50 py-1 min-w-[160px]"
    >
      <button
        onClick={() => handleAction(onEdit)}
        className={menuItemClass}
      >
        <span className="w-4 text-center">✎</span>
        Edit
      </button>

      <button
        onClick={() => handleAction(onChangeRole)}
        className={menuItemClass}
      >
        <span className="w-4 text-center">👤</span>
        Change Role
      </button>

      <button
        onClick={() => handleAction(onResetPassword)}
        className={`${menuItemClass} text-warning`}
      >
        <span className="w-4 text-center">🔑</span>
        Reset Password
      </button>

      {/* Separator before destructive action */}
      <div className="h-px bg-border my-1" />

      <button
        onClick={() => handleAction(onDelete)}
        className={`${menuItemClass} text-error`}
      >
        <span className="w-4 text-center">×</span>
        Delete
      </button>
    </div>
  );
}

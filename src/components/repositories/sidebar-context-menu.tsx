'use client';

import { useRef, useEffect } from 'react';
import type { Repository, Workspace } from '@/lib/db/schema';

interface SidebarContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  // Repository context
  repository?: Repository;
  onEditRepository?: () => void;
  onAddWorkspace?: () => void;
  onDeleteRepository?: () => void;
  // Workspace context
  workspace?: Workspace;
  onStartWorkspace?: () => void;
  onRestartWorkspace?: () => void;
  onShutdownWorkspace?: () => void;
  onRedeployWorkspace?: () => void;
  onDestroyWorkspace?: () => void;
  onDeleteWorkspace?: () => void;
  onReloadEnvVars?: () => void;
  onShareWorkspace?: () => void;
  // Loading states
  isRedeploying?: boolean;
  isDestroying?: boolean;
  // Permission checks
  isOwner?: boolean;
  isAdmin?: boolean;
}

export function SidebarContextMenu({
  position,
  onClose,
  repository,
  onEditRepository,
  onAddWorkspace,
  onDeleteRepository,
  workspace,
  onStartWorkspace,
  onRestartWorkspace,
  onShutdownWorkspace,
  onRedeployWorkspace,
  onDestroyWorkspace,
  onDeleteWorkspace,
  onReloadEnvVars,
  onShareWorkspace,
  isRedeploying,
  isDestroying,
  isOwner,
  isAdmin,
}: SidebarContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside or pressing Escape
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

  // Adjust position to keep menu in viewport
  const adjustedPosition = { ...position };
  if (typeof window !== 'undefined') {
    const menuWidth = 180;
    const menuHeight = 250;
    if (position.x + menuWidth > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - menuWidth - 10;
    }
    if (position.y + menuHeight > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - menuHeight - 10;
    }
  }

  const menuItemClass = "w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary flex items-center gap-2";
  const disabledClass = "opacity-50 cursor-not-allowed";

  // Determine workspace container state
  const containerStatus = workspace?.containerStatus;
  const isRunning = containerStatus === 'running';
  const hasContainer = containerStatus && containerStatus !== 'none';
  const isStopped = containerStatus === 'exited' || containerStatus === 'dead';
  const isOperationInProgress = isRedeploying || isDestroying;

  return (
    <div
      ref={menuRef}
      className="fixed bg-background border border-border rounded-md shadow-lg z-50 py-1 min-w-[160px]"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {/* Repository Context Menu */}
      {repository && (
        <>
          {/* Edit - only show if owner or admin */}
          {(isOwner || isAdmin) && (
            <button
              onClick={() => {
                onClose();
                onEditRepository?.();
              }}
              className={menuItemClass}
            >
              <span className="w-4 text-center">✎</span>
              Edit Repository
            </button>
          )}

          <button
            onClick={() => {
              onClose();
              onAddWorkspace?.();
            }}
            className={menuItemClass}
          >
            <span className="w-4 text-center">+</span>
            New Workspace
          </button>

          {/* Delete - only show if owner or admin */}
          {(isOwner || isAdmin) && (
            <>
              <div className="h-px bg-border my-1" />

              <button
                onClick={() => {
                  onClose();
                  onDeleteRepository?.();
                }}
                className={`${menuItemClass} text-error`}
              >
                <span className="w-4 text-center">×</span>
                Delete Repository
              </button>
            </>
          )}
        </>
      )}

      {/* Workspace Context Menu */}
      {workspace && (
        <>
          {/* Start - only show if container is stopped */}
          {isStopped && (
            <button
              onClick={() => {
                onClose();
                onStartWorkspace?.();
              }}
              className={`${menuItemClass} ${isOperationInProgress ? disabledClass : ''}`}
              disabled={isOperationInProgress}
            >
              <span className="w-4 text-center">▶</span>
              Start
            </button>
          )}

          {/* Restart - only show if running */}
          {isRunning && (
            <button
              onClick={() => {
                onClose();
                onRestartWorkspace?.();
              }}
              className={`${menuItemClass} ${isOperationInProgress ? disabledClass : ''}`}
              disabled={isOperationInProgress}
            >
              <span className="w-4 text-center">↻</span>
              Restart
            </button>
          )}

          {/* Shutdown - only show if running */}
          {isRunning && (
            <button
              onClick={() => {
                onClose();
                onShutdownWorkspace?.();
              }}
              className={`${menuItemClass} ${isOperationInProgress ? disabledClass : ''}`}
              disabled={isOperationInProgress}
            >
              <span className="w-4 text-center">■</span>
              Shutdown
            </button>
          )}

          <div className="h-px bg-border my-1" />

          {/* Reload Env Vars - only show if running */}
          {isRunning && (
            <button
              onClick={() => {
                onClose();
                onReloadEnvVars?.();
              }}
              className={`${menuItemClass} ${isOperationInProgress ? disabledClass : ''}`}
              disabled={isOperationInProgress}
            >
              <span className="w-4 text-center">🔄</span>
              Reload Env Vars
            </button>
          )}

          <div className="h-px bg-border my-1" />

          {/* Share Workspace - only show if owner or admin */}
          {(isOwner || isAdmin) && (
            <button
              onClick={() => {
                onClose();
                onShareWorkspace?.();
              }}
              className={menuItemClass}
            >
              <span className="w-4 text-center">👥</span>
              Share Workspace
            </button>
          )}

          <div className="h-px bg-border my-1" />

          {/* Redeploy - always available */}
          <button
            onClick={() => {
              onClose();
              onRedeployWorkspace?.();
            }}
            className={`${menuItemClass} ${isOperationInProgress ? disabledClass : ''}`}
            disabled={isOperationInProgress}
          >
            <span className="w-4 text-center">🔄</span>
            {isRedeploying ? 'Redeploying...' : 'Redeploy'}
          </button>

          {/* Destroy - only show if has container */}
          {hasContainer && (
            <button
              onClick={() => {
                onClose();
                onDestroyWorkspace?.();
              }}
              className={`${menuItemClass} text-warning ${isOperationInProgress ? disabledClass : ''}`}
              disabled={isOperationInProgress}
            >
              <span className="w-4 text-center">💥</span>
              {isDestroying ? 'Destroying...' : 'Destroy Container'}
            </button>
          )}

          <div className="h-px bg-border my-1" />

          {/* Delete - always available */}
          <button
            onClick={() => {
              onClose();
              onDeleteWorkspace?.();
            }}
            className={`${menuItemClass} text-error ${isOperationInProgress ? disabledClass : ''}`}
            disabled={isOperationInProgress}
          >
            <span className="w-4 text-center">×</span>
            Delete Workspace
          </button>
        </>
      )}
    </div>
  );
}

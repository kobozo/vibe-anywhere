'use client';

import { useState, useRef, useEffect } from 'react';
import type { TabGroupInfo } from '@/hooks/useTabGroups';

interface TabGroupIconProps {
  group: TabGroupInfo;
  isActive: boolean;
  onClick: () => void;
  onUngroup: () => void;
  onRename: (newName: string) => void;
}

export function TabGroupIcon({
  group,
  isActive,
  onClick,
  onUngroup,
  onRename,
}: TabGroupIconProps) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(group.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showContextMenu]);

  // Focus input when renaming
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowContextMenu(true);
  };

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== group.name) {
      onRename(renameValue.trim());
    }
    setIsRenaming(false);
    setShowContextMenu(false);
  };

  const getLayoutIcon = () => {
    switch (group.layout) {
      case 'horizontal':
        return (
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
            <rect x="1" y="2" width="6" height="12" rx="1" />
            <rect x="9" y="2" width="6" height="12" rx="1" />
          </svg>
        );
      case 'vertical':
        return (
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
            <rect x="1" y="1" width="14" height="6" rx="1" />
            <rect x="1" y="9" width="14" height="6" rx="1" />
          </svg>
        );
      case 'left-stack':
      case 'right-stack':
        return (
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
            <rect x="1" y="1" width="6" height="14" rx="1" />
            <rect x="9" y="1" width="6" height="6" rx="1" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
          </svg>
        );
      case 'grid-2x2':
        return (
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
            <rect x="1" y="1" width="6" height="6" rx="1" />
            <rect x="9" y="1" width="6" height="6" rx="1" />
            <rect x="1" y="9" width="6" height="6" rx="1" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative">
      <div
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-t cursor-pointer group
          ${isActive
            ? 'bg-background text-foreground ring-2 ring-primary'
            : 'bg-background-tertiary/50 text-foreground-secondary hover:bg-background-tertiary hover:text-foreground'
          }`}
        title={`${group.name} (${group.members.length} tabs) - ${isActive ? 'Click to close' : 'Click to open'} - Right-click for options`}
      >
        {/* Layout icon */}
        <span className="text-primary">
          {getLayoutIcon()}
        </span>

        {/* Group name */}
        <span className="text-sm whitespace-nowrap max-w-[100px] truncate">
          {group.name}
        </span>

        {/* Member count badge */}
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
          {group.members.length}
        </span>
      </div>

      {/* Context menu */}
      {showContextMenu && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 mt-1 bg-background border border-border rounded-md shadow-lg z-50 py-1 min-w-[120px]"
        >
          {isRenaming ? (
            <div className="px-2 py-1">
              <input
                ref={inputRef}
                type="text"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
                onBlur={handleRenameSubmit}
                className="w-full px-2 py-1 text-sm bg-background-secondary border border-border rounded"
              />
            </div>
          ) : (
            <>
              <button
                onClick={() => setIsRenaming(true)}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary"
              >
                Rename
              </button>
              <button
                onClick={() => {
                  setShowContextMenu(false);
                  onUngroup();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary text-error"
              >
                Ungroup
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

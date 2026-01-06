'use client';

import { useRef, useEffect, useState } from 'react';
import type { TabInfo } from '@/hooks/useTabs';
import type { TabGroupInfo } from '@/hooks/useTabGroups';

interface TabContextMenuProps {
  tab: TabInfo;
  position: { x: number; y: number };
  otherTabs: TabInfo[];
  groups: TabGroupInfo[];
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onGroupWith: (otherTabId: string) => void;
  onAddToGroup?: (groupId: string) => void;
  onStartMultiSelect: () => void;
}

export function TabContextMenu({
  tab,
  position,
  otherTabs,
  groups,
  onClose,
  onDelete,
  onDuplicate,
  onGroupWith,
  onAddToGroup,
  onStartMultiSelect,
}: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'groupWith' | 'addToGroup' | null>(null);

  // Close menu when clicking outside
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
    const menuHeight = 200;
    if (position.x + menuWidth > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - menuWidth - 10;
    }
    if (position.y + menuHeight > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - menuHeight - 10;
    }
  }

  const menuItemClass = "w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary flex items-center justify-between";
  const submenuClass = "absolute left-full top-0 ml-1 bg-background border border-border rounded-md shadow-lg z-50 py-1 min-w-[140px]";

  return (
    <div
      ref={menuRef}
      className="fixed bg-background border border-border rounded-md shadow-lg z-50 py-1 min-w-[160px]"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {/* Tab Actions */}
      <button
        onClick={() => {
          onClose();
          onDelete();
        }}
        className={`${menuItemClass} text-error`}
      >
        Close
      </button>

      {tab.tabType !== 'git' && tab.tabType !== 'docker' && (
        <button
          onClick={() => {
            onClose();
            onDuplicate();
          }}
          className={menuItemClass}
        >
          Duplicate
        </button>
      )}

      {/* Separator */}
      <div className="h-px bg-border my-1" />

      {/* Grouping Options */}
      {otherTabs.length > 0 && (
        <div
          className="relative"
          onMouseEnter={() => setActiveSubmenu('groupWith')}
          onMouseLeave={() => setActiveSubmenu(null)}
        >
          <button className={menuItemClass}>
            Group with...
            <span className="text-foreground-tertiary">›</span>
          </button>
          {activeSubmenu === 'groupWith' && (
            <div className={submenuClass}>
              {otherTabs.map((otherTab) => (
                <button
                  key={otherTab.id}
                  onClick={() => {
                    onClose();
                    onGroupWith(otherTab.id);
                  }}
                  className={menuItemClass}
                >
                  <span className="truncate max-w-[120px]">{otherTab.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {groups.length > 0 && onAddToGroup && (
        <div
          className="relative"
          onMouseEnter={() => setActiveSubmenu('addToGroup')}
          onMouseLeave={() => setActiveSubmenu(null)}
        >
          <button className={menuItemClass}>
            Add to group...
            <span className="text-foreground-tertiary">›</span>
          </button>
          {activeSubmenu === 'addToGroup' && (
            <div className={submenuClass}>
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => {
                    onClose();
                    onAddToGroup(group.id);
                  }}
                  className={menuItemClass}
                >
                  <span className="truncate max-w-[100px]">{group.name}</span>
                  <span className="text-xs text-foreground-tertiary ml-2">
                    ({group.members.length})
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {otherTabs.length > 0 && (
        <button
          onClick={() => {
            onClose();
            onStartMultiSelect();
          }}
          className={menuItemClass}
        >
          Select for grouping
        </button>
      )}
    </div>
  );
}

'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import type { TabInfo } from '@/hooks/useTabs';
import type { TabGroupInfo } from '@/hooks/useTabGroups';
import type { TabTemplate } from '@/hooks/useTabTemplates';
import type { TabType } from '@/lib/db/schema';
import { getTemplateIcon } from '@/components/icons/ai-icons';

export type SplitDirection = 'left' | 'right' | 'top' | 'bottom';

// Static tab options for Git and Docker
interface StaticTabOption {
  id: string;
  name: string;
  icon: string;
  tabType: TabType;
  requiredTechStack?: string;
}

const STATIC_TAB_OPTIONS: StaticTabOption[] = [
  {
    id: 'static-git',
    name: 'Git',
    icon: 'git',
    tabType: 'git',
  },
  {
    id: 'static-docker',
    name: 'Docker',
    icon: 'docker',
    tabType: 'docker',
    requiredTechStack: 'docker',
  },
];

interface TerminalContextMenuProps {
  position: { x: number; y: number };
  tab: TabInfo;
  currentGroup: TabGroupInfo | null;
  availableTabs: TabInfo[]; // Tabs available for split (not in groups, not current)
  groups: TabGroupInfo[]; // All groups (for Add to group...)
  templates: TabTemplate[];
  existingTabTypes: TabType[]; // Tab types that already exist (to hide git/docker if already open)
  workspaceTechStacks: string[]; // To check if Docker should be shown
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onReloadEnvVars?: () => void;
  onAddToGroup?: (groupId: string) => void;
  onStartMultiSelect: () => void;
  onSplitWithExisting: (direction: SplitDirection, tabId: string, currentGroup: TabGroupInfo | null) => void;
  onSplitWithTemplate: (direction: SplitDirection, templateId: string, currentGroup: TabGroupInfo | null) => void;
  onSplitWithStaticTab: (direction: SplitDirection, tabType: TabType, currentGroup: TabGroupInfo | null) => void;
}

export function TerminalContextMenu({
  position,
  tab,
  currentGroup,
  availableTabs,
  groups,
  templates,
  existingTabTypes,
  workspaceTechStacks,
  onClose,
  onDelete,
  onDuplicate,
  onReloadEnvVars,
  onAddToGroup,
  onStartMultiSelect,
  onSplitWithExisting,
  onSplitWithTemplate,
  onSplitWithStaticTab,
}: TerminalContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'addToGroup' | 'split' | null>(null);
  const [activeSplitDirection, setActiveSplitDirection] = useState<SplitDirection | null>(null);
  const [activeSplitChoice, setActiveSplitChoice] = useState<'existing' | 'template' | null>(null);

  // Filter static tabs: show if not already existing and tech stack requirement is met
  const availableStaticTabs = useMemo(() => {
    return STATIC_TAB_OPTIONS.filter((staticTab) => {
      // Hide if this tab type already exists
      if (existingTabTypes.includes(staticTab.tabType)) return false;
      // Check tech stack requirement
      if (!staticTab.requiredTechStack) return true;
      return workspaceTechStacks.includes(staticTab.requiredTechStack);
    });
  }, [existingTabTypes, workspaceTechStacks]);

  // Timeout refs for delayed submenu closing
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const directionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if group is full (4 tabs max)
  const isGroupFull = !!(currentGroup && currentGroup.members.length >= 4);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (submenuTimeoutRef.current) clearTimeout(submenuTimeoutRef.current);
      if (directionTimeoutRef.current) clearTimeout(directionTimeoutRef.current);
    };
  }, []);

  // Delayed submenu close handlers
  const handleSubmenuEnter = useCallback((submenu: 'addToGroup' | 'split') => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
    setActiveSubmenu(submenu);
  }, []);

  const handleSubmenuLeave = useCallback(() => {
    submenuTimeoutRef.current = setTimeout(() => {
      setActiveSubmenu(null);
      setActiveSplitDirection(null);
      setActiveSplitChoice(null);
    }, 150); // 150ms delay before closing
  }, []);

  const handleDirectionEnter = useCallback((dir: SplitDirection) => {
    if (directionTimeoutRef.current) {
      clearTimeout(directionTimeoutRef.current);
      directionTimeoutRef.current = null;
    }
    setActiveSplitDirection(dir);
    setActiveSplitChoice(null);
  }, []);

  const handleDirectionLeave = useCallback(() => {
    directionTimeoutRef.current = setTimeout(() => {
      setActiveSplitDirection(null);
      setActiveSplitChoice(null);
    }, 150);
  }, []);

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
    const menuWidth = 200;
    const menuHeight = 300;
    if (position.x + menuWidth > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - menuWidth - 10;
    }
    if (position.y + menuHeight > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - menuHeight - 10;
    }
  }

  const menuItemClass = "w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary flex items-center justify-between";
  const submenuClass = "absolute left-full top-0 ml-1 bg-background border border-border rounded-md shadow-lg z-50 py-1 min-w-[160px]";
  const disabledClass = "opacity-50 cursor-not-allowed";

  const directions: { key: SplitDirection; label: string }[] = [
    { key: 'right', label: 'Split Right' },
    { key: 'left', label: 'Split Left' },
    { key: 'bottom', label: 'Split Down' },
    { key: 'top', label: 'Split Up' },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed bg-background border border-border rounded-md shadow-lg z-50 py-1 min-w-[180px]"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {/* Tab Actions - same as tab context menu */}
      {tab.tabType !== 'dashboard' && (
        <button
          onClick={() => {
            onClose();
            onDelete();
          }}
          className={`${menuItemClass} text-error`}
        >
          Close
        </button>
      )}

      {tab.tabType !== 'git' && tab.tabType !== 'docker' && tab.tabType !== 'dashboard' && (
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

      {/* Reload Env Vars */}
      {onReloadEnvVars && (
        <button
          onClick={() => {
            onClose();
            onReloadEnvVars();
          }}
          className={menuItemClass}
        >
          Reload Env Vars
        </button>
      )}

      {/* Separator */}
      <div className="h-px bg-border my-1" />

      {/* Grouping Options */}
      {groups.length > 0 && onAddToGroup && (
        <div
          className="relative"
          onMouseEnter={() => handleSubmenuEnter('addToGroup')}
          onMouseLeave={handleSubmenuLeave}
        >
          <button className={menuItemClass}>
            Add to group...
            <span className="text-foreground-tertiary">›</span>
          </button>
          {activeSubmenu === 'addToGroup' && (
            <div
              className={submenuClass}
              onMouseEnter={() => handleSubmenuEnter('addToGroup')}
              onMouseLeave={handleSubmenuLeave}
            >
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => {
                    onClose();
                    onAddToGroup(group.id);
                  }}
                  className={menuItemClass}
                  disabled={group.members.length >= 4}
                >
                  <span className="truncate max-w-[100px]">{group.name}</span>
                  <span className="text-xs text-foreground-tertiary ml-2">
                    ({group.members.length}/4)
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {availableTabs.length > 0 && (
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

      {/* Separator before Split */}
      <div className="h-px bg-border my-1" />

      {/* Split option with nested submenus */}
      <div
        className="relative"
        onMouseEnter={() => handleSubmenuEnter('split')}
        onMouseLeave={handleSubmenuLeave}
      >
        <button
          className={`${menuItemClass} ${isGroupFull ? disabledClass : ''}`}
          disabled={isGroupFull}
          title={isGroupFull ? 'Group has maximum 4 tabs' : undefined}
        >
          Split
          {!isGroupFull && <span className="text-foreground-tertiary">›</span>}
        </button>

        {/* Direction submenu */}
        {activeSubmenu === 'split' && !isGroupFull && (
          <div
            className={submenuClass}
            onMouseEnter={() => handleSubmenuEnter('split')}
            onMouseLeave={handleSubmenuLeave}
          >
            {directions.map((dir) => (
              <div
                key={dir.key}
                className="relative"
                onMouseEnter={() => handleDirectionEnter(dir.key)}
                onMouseLeave={handleDirectionLeave}
              >
                <button className={menuItemClass}>
                  {dir.label}
                  <span className="text-foreground-tertiary">›</span>
                </button>

                {/* Choice submenu (Existing Tab / New Tab) */}
                {activeSplitDirection === dir.key && (
                  <div
                    className={submenuClass}
                    onMouseEnter={() => handleDirectionEnter(dir.key)}
                    onMouseLeave={handleDirectionLeave}
                    style={{ maxHeight: '400px', overflowY: 'auto' }}
                  >
                    {/* Existing tabs section */}
                    {availableTabs.length > 0 && (
                      <>
                        <div className="px-3 py-1 text-xs text-foreground-tertiary font-medium">
                          Existing Tabs
                        </div>
                        {availableTabs.map((availableTab) => (
                          <button
                            key={availableTab.id}
                            onClick={() => {
                              // Don't call onClose - handleSplitWithExisting will close the menu
                              onSplitWithExisting(dir.key, availableTab.id, currentGroup);
                            }}
                            className={menuItemClass}
                          >
                            <span className="flex items-center gap-2">
                              {availableTab.icon ? (
                                <span className="w-4 h-4 flex items-center justify-center">
                                  {getTemplateIcon(availableTab.icon, true, 'w-4 h-4')}
                                </span>
                              ) : availableTab.tabType === 'git' ? (
                                <Image
                                  src="/icons/ai/github.png"
                                  alt="Git"
                                  width={16}
                                  height={16}
                                  className="w-4 h-4"
                                  unoptimized
                                />
                              ) : availableTab.tabType === 'docker' ? (
                                <Image
                                  src="/icons/ai/docker.png"
                                  alt="Docker"
                                  width={16}
                                  height={16}
                                  className="w-4 h-4"
                                />
                              ) : (
                                <span className="w-4 h-4 flex items-center justify-center text-foreground-tertiary">
                                  ●
                                </span>
                              )}
                              <span className="truncate max-w-[120px]">{availableTab.name}</span>
                            </span>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Separator between existing and new tabs */}
                    {availableTabs.length > 0 && (availableStaticTabs.length > 0 || templates.length > 0) && (
                      <div className="h-px bg-border my-1" />
                    )}

                    {/* New tab section - static tabs (Git/Docker) and templates */}
                    {(availableStaticTabs.length > 0 || templates.length > 0) && (
                      <>
                        <div className="px-3 py-1 text-xs text-foreground-tertiary font-medium">
                          New Tab
                        </div>
                        {/* Static tabs (Git, Docker) */}
                        {availableStaticTabs.map((staticTab) => (
                          <button
                            key={staticTab.id}
                            onClick={() => {
                              onSplitWithStaticTab(dir.key, staticTab.tabType, currentGroup);
                            }}
                            className={menuItemClass}
                          >
                            <span className="flex items-center gap-2">
                              {staticTab.tabType === 'git' ? (
                                <Image
                                  src="/icons/ai/github.png"
                                  alt="Git"
                                  width={16}
                                  height={16}
                                  className="w-4 h-4"
                                  unoptimized
                                />
                              ) : staticTab.tabType === 'docker' ? (
                                <Image
                                  src="/icons/ai/docker.png"
                                  alt="Docker"
                                  width={16}
                                  height={16}
                                  className="w-4 h-4"
                                />
                              ) : (
                                <span className="w-4 h-4 flex items-center justify-center">
                                  {getTemplateIcon(staticTab.icon, true, 'w-4 h-4')}
                                </span>
                              )}
                              <span className="truncate max-w-[120px]">{staticTab.name}</span>
                            </span>
                          </button>
                        ))}
                        {/* Template tabs */}
                        {templates.map((template) => (
                          <button
                            key={template.id}
                            onClick={() => {
                              onSplitWithTemplate(dir.key, template.id, currentGroup);
                            }}
                            className={menuItemClass}
                          >
                            <span className="flex items-center gap-2">
                              <span className="w-4 h-4 flex items-center justify-center">
                                {getTemplateIcon(template.icon || 'terminal', true, 'w-4 h-4')}
                              </span>
                              <span className="truncate max-w-[120px]">{template.name}</span>
                            </span>
                          </button>
                        ))}
                      </>
                    )}

                    {/* No options message */}
                    {availableTabs.length === 0 && availableStaticTabs.length === 0 && templates.length === 0 && (
                      <div className="px-3 py-2 text-sm text-foreground-tertiary">
                        No tabs available
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info if group is full */}
      {isGroupFull && (
        <div className="px-3 py-1.5 text-xs text-foreground-tertiary">
          Group has max 4 tabs
        </div>
      )}
    </div>
  );
}

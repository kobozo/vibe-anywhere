'use client';

import { useCallback, useMemo } from 'react';
import { Panel, Group } from 'react-resizable-panels';
import { ResizableDivider } from './ResizableDivider';
import { SplitViewPane } from './SplitViewPane';
import { LAYOUT_CONFIGS } from './types';
import type { TabGroupInfo } from '@/hooks/useTabGroups';
import type { TabInfo } from '@/hooks/useTabs';

interface SplitViewContainerProps {
  group: TabGroupInfo;
  tabs: TabInfo[];
  workspaceId: string;
  containerIp?: string | null;
  onPaneResize?: (sizes: { tabId: string; sizePercent: number }[]) => void;
  onConnectionChange?: (tabId: string, connected: boolean) => void;
  onTabEnd?: (tabId: string) => void;
  onTerminalContextMenu?: (event: { x: number; y: number; tabId: string }) => void;
}

export function SplitViewContainer({
  group,
  tabs,
  workspaceId,
  containerIp,
  onPaneResize,
  onConnectionChange,
  onTabEnd,
  onTerminalContextMenu,
}: SplitViewContainerProps) {
  const config = LAYOUT_CONFIGS[group.layout];

  // Build a map of tabId -> TabInfo for quick lookup
  const tabMap = useMemo(() => {
    const map = new Map<string, TabInfo>();
    tabs.forEach(t => map.set(t.id, t));
    return map;
  }, [tabs]);

  // Get tab info for a member
  const getTabForMember = useCallback(
    (paneIndex: number): TabInfo | null => {
      const member = group.members.find(m => m.paneIndex === paneIndex);
      if (!member) return null;
      return tabMap.get(member.tabId) || null;
    },
    [group.members, tabMap]
  );

  // Render a simple 2-pane layout (horizontal or vertical)
  if (!config.nested) {
    return (
      <Group
        orientation={config.direction}
        className="h-full w-full"
      >
        <Panel
          defaultSize={group.members[0]?.sizePercent || 50}
          minSize={15}
          className="min-h-0 min-w-0"
        >
          <SplitViewPane
            tab={getTabForMember(0)}
            workspaceId={workspaceId}
            containerIp={containerIp}
            onConnectionChange={connected => {
              const tab = getTabForMember(0);
              if (tab) onConnectionChange?.(tab.id, connected);
            }}
            onEnd={() => {
              const tab = getTabForMember(0);
              if (tab) onTabEnd?.(tab.id);
            }}
            onContextMenu={onTerminalContextMenu}
          />
        </Panel>

        <ResizableDivider orientation={config.direction} />

        <Panel
          defaultSize={group.members[1]?.sizePercent || 50}
          minSize={15}
          className="min-h-0 min-w-0"
        >
          <SplitViewPane
            tab={getTabForMember(1)}
            workspaceId={workspaceId}
            containerIp={containerIp}
            onConnectionChange={connected => {
              const tab = getTabForMember(1);
              if (tab) onConnectionChange?.(tab.id, connected);
            }}
            onEnd={() => {
              const tab = getTabForMember(1);
              if (tab) onTabEnd?.(tab.id);
            }}
            onContextMenu={onTerminalContextMenu}
          />
        </Panel>
      </Group>
    );
  }

  // 3-pane layouts: left-stack or right-stack
  if (config.layout === 'left-stack') {
    // Left + (Right-Top / Right-Bottom)
    return (
      <Group orientation="horizontal" className="h-full w-full">
        <Panel defaultSize={50} minSize={20} className="min-h-0 min-w-0">
          <SplitViewPane
            tab={getTabForMember(0)}
            workspaceId={workspaceId}
            containerIp={containerIp}
            onConnectionChange={connected => {
              const tab = getTabForMember(0);
              if (tab) onConnectionChange?.(tab.id, connected);
            }}
            onEnd={() => {
              const tab = getTabForMember(0);
              if (tab) onTabEnd?.(tab.id);
            }}
            onContextMenu={onTerminalContextMenu}
          />
        </Panel>

        <ResizableDivider orientation="horizontal" />

        <Panel defaultSize={50} minSize={20} className="min-h-0 min-w-0">
          <Group orientation="vertical" className="h-full">
            <Panel defaultSize={50} minSize={20} className="min-h-0">
              <SplitViewPane
                tab={getTabForMember(1)}
                workspaceId={workspaceId}
                onConnectionChange={connected => {
                  const tab = getTabForMember(1);
                  if (tab) onConnectionChange?.(tab.id, connected);
                }}
                onEnd={() => {
                  const tab = getTabForMember(1);
                  if (tab) onTabEnd?.(tab.id);
                }}
                onContextMenu={onTerminalContextMenu}
              />
            </Panel>

            <ResizableDivider orientation="vertical" />

            <Panel defaultSize={50} minSize={20} className="min-h-0">
              <SplitViewPane
                tab={getTabForMember(2)}
                workspaceId={workspaceId}
                onConnectionChange={connected => {
                  const tab = getTabForMember(2);
                  if (tab) onConnectionChange?.(tab.id, connected);
                }}
                onEnd={() => {
                  const tab = getTabForMember(2);
                  if (tab) onTabEnd?.(tab.id);
                }}
                onContextMenu={onTerminalContextMenu}
              />
            </Panel>
          </Group>
        </Panel>
      </Group>
    );
  }

  if (config.layout === 'right-stack') {
    // (Left-Top / Left-Bottom) + Right
    return (
      <Group orientation="horizontal" className="h-full w-full">
        <Panel defaultSize={50} minSize={20} className="min-h-0 min-w-0">
          <Group orientation="vertical" className="h-full">
            <Panel defaultSize={50} minSize={20} className="min-h-0">
              <SplitViewPane
                tab={getTabForMember(0)}
                workspaceId={workspaceId}
                onConnectionChange={connected => {
                  const tab = getTabForMember(0);
                  if (tab) onConnectionChange?.(tab.id, connected);
                }}
                onEnd={() => {
                  const tab = getTabForMember(0);
                  if (tab) onTabEnd?.(tab.id);
                }}
                onContextMenu={onTerminalContextMenu}
              />
            </Panel>

            <ResizableDivider orientation="vertical" />

            <Panel defaultSize={50} minSize={20} className="min-h-0">
              <SplitViewPane
                tab={getTabForMember(1)}
                workspaceId={workspaceId}
                onConnectionChange={connected => {
                  const tab = getTabForMember(1);
                  if (tab) onConnectionChange?.(tab.id, connected);
                }}
                onEnd={() => {
                  const tab = getTabForMember(1);
                  if (tab) onTabEnd?.(tab.id);
                }}
                onContextMenu={onTerminalContextMenu}
              />
            </Panel>
          </Group>
        </Panel>

        <ResizableDivider orientation="horizontal" />

        <Panel defaultSize={50} minSize={20} className="min-h-0 min-w-0">
          <SplitViewPane
            tab={getTabForMember(2)}
            workspaceId={workspaceId}
            containerIp={containerIp}
            onConnectionChange={connected => {
              const tab = getTabForMember(2);
              if (tab) onConnectionChange?.(tab.id, connected);
            }}
            onEnd={() => {
              const tab = getTabForMember(2);
              if (tab) onTabEnd?.(tab.id);
            }}
            onContextMenu={onTerminalContextMenu}
          />
        </Panel>
      </Group>
    );
  }

  // 4-pane grid layout (grid-2x2)
  if (config.layout === 'grid-2x2') {
    return (
      <Group orientation="horizontal" className="h-full w-full">
        {/* Left column */}
        <Panel defaultSize={50} minSize={20} className="min-h-0 min-w-0">
          <Group orientation="vertical" className="h-full">
            <Panel defaultSize={50} minSize={20} className="min-h-0">
              <SplitViewPane
                tab={getTabForMember(0)}
                workspaceId={workspaceId}
                onConnectionChange={connected => {
                  const tab = getTabForMember(0);
                  if (tab) onConnectionChange?.(tab.id, connected);
                }}
                onEnd={() => {
                  const tab = getTabForMember(0);
                  if (tab) onTabEnd?.(tab.id);
                }}
                onContextMenu={onTerminalContextMenu}
              />
            </Panel>

            <ResizableDivider orientation="vertical" />

            <Panel defaultSize={50} minSize={20} className="min-h-0">
              <SplitViewPane
                tab={getTabForMember(2)}
                workspaceId={workspaceId}
                onConnectionChange={connected => {
                  const tab = getTabForMember(2);
                  if (tab) onConnectionChange?.(tab.id, connected);
                }}
                onEnd={() => {
                  const tab = getTabForMember(2);
                  if (tab) onTabEnd?.(tab.id);
                }}
                onContextMenu={onTerminalContextMenu}
              />
            </Panel>
          </Group>
        </Panel>

        <ResizableDivider orientation="horizontal" />

        {/* Right column */}
        <Panel defaultSize={50} minSize={20} className="min-h-0 min-w-0">
          <Group orientation="vertical" className="h-full">
            <Panel defaultSize={50} minSize={20} className="min-h-0">
              <SplitViewPane
                tab={getTabForMember(1)}
                workspaceId={workspaceId}
                onConnectionChange={connected => {
                  const tab = getTabForMember(1);
                  if (tab) onConnectionChange?.(tab.id, connected);
                }}
                onEnd={() => {
                  const tab = getTabForMember(1);
                  if (tab) onTabEnd?.(tab.id);
                }}
                onContextMenu={onTerminalContextMenu}
              />
            </Panel>

            <ResizableDivider orientation="vertical" />

            <Panel defaultSize={50} minSize={20} className="min-h-0">
              <SplitViewPane
                tab={getTabForMember(3)}
                workspaceId={workspaceId}
                containerIp={containerIp}
                onConnectionChange={connected => {
                  const tab = getTabForMember(3);
                  if (tab) onConnectionChange?.(tab.id, connected);
                }}
                onEnd={() => {
                  const tab = getTabForMember(3);
                  if (tab) onTabEnd?.(tab.id);
                }}
                onContextMenu={onTerminalContextMenu}
              />
            </Panel>
          </Group>
        </Panel>
      </Group>
    );
  }

  // Fallback - should not reach here
  return (
    <div className="h-full w-full flex items-center justify-center bg-background-secondary text-foreground-tertiary">
      <p>Unknown layout: {config.layout}</p>
    </div>
  );
}

'use client';

import dynamic from 'next/dynamic';
import { GitPanel } from '@/components/git/GitPanel';
import type { TabInfo } from '@/hooks/useTabs';

// Dynamically import Terminal to avoid SSR issues with xterm
const Terminal = dynamic(
  () => import('@/components/terminal/terminal').then(mod => ({ default: mod.Terminal })),
  { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center bg-background-secondary">Loading terminal...</div> }
);

interface SplitViewPaneProps {
  tab: TabInfo | null;
  workspaceId: string;
  containerIp?: string | null;
  onConnectionChange?: (connected: boolean) => void;
  onEnd?: () => void;
  onContextMenu?: (event: { x: number; y: number; tabId: string }) => void;
  isFocused?: boolean;
  onFocus?: () => void;
}

export function SplitViewPane({
  tab,
  workspaceId,
  containerIp,
  onConnectionChange,
  onEnd,
  onContextMenu,
  isFocused,
  onFocus,
}: SplitViewPaneProps) {
  // No tab assigned to this pane
  if (!tab) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background-secondary text-foreground-tertiary">
        <p>No tab assigned</p>
      </div>
    );
  }

  // Git tab - render GitPanel
  if (tab.tabType === 'git') {
    return (
      <div className="h-full w-full overflow-hidden">
        <GitPanel workspaceId={workspaceId} />
      </div>
    );
  }

  // Terminal tab - check status
  if (tab.status === 'running') {
    return (
      <div
        className={`h-full w-full overflow-hidden ${isFocused ? 'ring-1 ring-primary ring-inset' : ''}`}
        onClick={onFocus}
      >
        <Terminal
          tabId={tab.id}
          workspaceId={workspaceId}
          onConnectionChange={onConnectionChange}
          onEnd={onEnd}
          onContextMenu={onContextMenu}
          hideStatusBar
        />
      </div>
    );
  }

  // Tab not running - show status
  const statusMessages: Record<string, { title: string; description: string }> = {
    pending: {
      title: 'Tab Pending',
      description: 'Click the tab in the bar to start it.',
    },
    starting: {
      title: 'Starting...',
      description: 'The container is starting up.',
    },
    restarting: {
      title: 'Restarting...',
      description: 'The container is restarting. Tab will resume automatically.',
    },
    stopped: {
      title: 'Stopped',
      description: 'The container is stopped. Start the container to resume.',
    },
    error: {
      title: 'Tab Error',
      description: 'An error occurred. Try restarting the tab.',
    },
  };

  const message = statusMessages[tab.status] || statusMessages.pending;

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-background-secondary text-foreground-tertiary gap-2">
      <p className="font-medium text-foreground-secondary">{message.title}</p>
      <p className="text-sm">{message.description}</p>
      <p className="text-xs mt-2 px-3 py-1 bg-background rounded-md">
        {tab.name}
      </p>
    </div>
  );
}

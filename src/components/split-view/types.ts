import type { TabGroupLayout } from '@/lib/db/schema';
import type { TabInfo } from '@/hooks/useTabs';

export type { TabGroupLayout };

// Layout configuration for rendering
export interface LayoutConfig {
  layout: TabGroupLayout;
  direction: 'horizontal' | 'vertical';
  paneCount: number;
  // For nested layouts (3-pane or 4-pane)
  nested?: {
    // Which pane index contains the nested group (-1 means all contain nested)
    index: number;
    direction: 'horizontal' | 'vertical';
    paneCount: number;
  };
}

// Map layout types to their configurations
export const LAYOUT_CONFIGS: Record<TabGroupLayout, LayoutConfig> = {
  'horizontal': {
    layout: 'horizontal',
    direction: 'horizontal',
    paneCount: 2,
  },
  'vertical': {
    layout: 'vertical',
    direction: 'vertical',
    paneCount: 2,
  },
  'left-stack': {
    layout: 'left-stack',
    direction: 'horizontal',
    paneCount: 2,
    nested: {
      index: 1, // Right pane is nested
      direction: 'vertical',
      paneCount: 2,
    },
  },
  'right-stack': {
    layout: 'right-stack',
    direction: 'horizontal',
    paneCount: 2,
    nested: {
      index: 0, // Left pane is nested
      direction: 'vertical',
      paneCount: 2,
    },
  },
  'grid-2x2': {
    layout: 'grid-2x2',
    direction: 'horizontal',
    paneCount: 2,
    nested: {
      index: -1, // Both columns are nested
      direction: 'vertical',
      paneCount: 2,
    },
  },
};

// Get pane position labels for a layout
export function getPaneLabels(layout: TabGroupLayout): string[] {
  switch (layout) {
    case 'horizontal':
      return ['Left', 'Right'];
    case 'vertical':
      return ['Top', 'Bottom'];
    case 'left-stack':
      return ['Left', 'Right Top', 'Right Bottom'];
    case 'right-stack':
      return ['Left Top', 'Left Bottom', 'Right'];
    case 'grid-2x2':
      return ['Top Left', 'Top Right', 'Bottom Left', 'Bottom Right'];
    default:
      return [];
  }
}

// Get required pane count for a layout
export function getRequiredPaneCount(layout: TabGroupLayout): number {
  switch (layout) {
    case 'horizontal':
    case 'vertical':
      return 2;
    case 'left-stack':
    case 'right-stack':
      return 3;
    case 'grid-2x2':
      return 4;
    default:
      return 2;
  }
}

// Suggest layout based on tab count
export function suggestLayout(tabCount: number): TabGroupLayout {
  switch (tabCount) {
    case 2:
      return 'horizontal';
    case 3:
      return 'left-stack';
    case 4:
      return 'grid-2x2';
    default:
      return 'horizontal';
  }
}

// Pane info within split view
export interface SplitPaneInfo {
  tabId: string;
  tab: TabInfo;
  paneIndex: number;
  sizePercent: number;
}

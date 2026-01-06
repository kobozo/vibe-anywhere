'use client';

import { suggestLayout, getRequiredPaneCount } from './types';
import type { TabGroupLayout } from '@/lib/db/schema';

interface LayoutPickerProps {
  selectedLayout: TabGroupLayout;
  onSelectLayout: (layout: TabGroupLayout) => void;
  tabCount: number;
  disabled?: boolean;
}

interface LayoutOption {
  layout: TabGroupLayout;
  label: string;
  requiredTabs: number;
  icon: React.ReactNode;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    layout: 'horizontal',
    label: 'Left / Right',
    requiredTabs: 2,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <rect x="2" y="4" width="9" height="16" rx="1" />
        <rect x="13" y="4" width="9" height="16" rx="1" />
      </svg>
    ),
  },
  {
    layout: 'vertical',
    label: 'Top / Bottom',
    requiredTabs: 2,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <rect x="2" y="2" width="20" height="9" rx="1" />
        <rect x="2" y="13" width="20" height="9" rx="1" />
      </svg>
    ),
  },
  {
    layout: 'left-stack',
    label: 'Left + Right Stack',
    requiredTabs: 3,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <rect x="2" y="2" width="9" height="20" rx="1" />
        <rect x="13" y="2" width="9" height="9" rx="1" />
        <rect x="13" y="13" width="9" height="9" rx="1" />
      </svg>
    ),
  },
  {
    layout: 'right-stack',
    label: 'Left Stack + Right',
    requiredTabs: 3,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <rect x="2" y="2" width="9" height="9" rx="1" />
        <rect x="2" y="13" width="9" height="9" rx="1" />
        <rect x="13" y="2" width="9" height="20" rx="1" />
      </svg>
    ),
  },
  {
    layout: 'grid-2x2',
    label: '2x2 Grid',
    requiredTabs: 4,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <rect x="2" y="2" width="9" height="9" rx="1" />
        <rect x="13" y="2" width="9" height="9" rx="1" />
        <rect x="2" y="13" width="9" height="9" rx="1" />
        <rect x="13" y="13" width="9" height="9" rx="1" />
      </svg>
    ),
  },
];

export function LayoutPicker({
  selectedLayout,
  onSelectLayout,
  tabCount,
  disabled = false,
}: LayoutPickerProps) {
  const suggestedLayout = suggestLayout(tabCount);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground-secondary">
        Layout
      </label>
      <div className="grid grid-cols-5 gap-2">
        {LAYOUT_OPTIONS.map((option) => {
          const isAvailable = tabCount >= option.requiredTabs;
          const isSelected = selectedLayout === option.layout;
          const isSuggested = suggestedLayout === option.layout;

          return (
            <button
              key={option.layout}
              type="button"
              onClick={() => onSelectLayout(option.layout)}
              disabled={disabled || !isAvailable}
              title={`${option.label}${!isAvailable ? ` (requires ${option.requiredTabs} tabs)` : ''}${isSuggested ? ' (Recommended)' : ''}`}
              className={`
                p-3 rounded-lg border-2 transition-all
                flex flex-col items-center gap-1
                ${isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : isAvailable
                    ? 'border-border hover:border-primary/50 text-foreground-secondary hover:text-foreground'
                    : 'border-border/50 text-foreground-tertiary opacity-50 cursor-not-allowed'
                }
                ${isSuggested && !isSelected && isAvailable ? 'ring-2 ring-primary/30' : ''}
              `}
            >
              {option.icon}
              <span className="text-xs whitespace-nowrap">
                {option.requiredTabs}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-foreground-tertiary">
        {tabCount} tab{tabCount !== 1 ? 's' : ''} selected.
        {tabCount < 2 && ' Select at least 2 tabs to create a group.'}
      </p>
    </div>
  );
}

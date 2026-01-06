'use client';

import { Separator } from 'react-resizable-panels';

interface ResizableDividerProps {
  orientation: 'horizontal' | 'vertical';
  className?: string;
}

export function ResizableDivider({ orientation, className = '' }: ResizableDividerProps) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <Separator
      className={`
        group
        flex items-center justify-center
        ${isHorizontal ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'}
        bg-transparent
        hover:bg-primary/20
        active:bg-primary/30
        data-[resize-handle-active]:bg-primary/30
        transition-colors duration-150
        ${className}
      `}
    >
      {/* Visual handle indicator */}
      <div
        className={`
          ${isHorizontal ? 'w-0.5 h-8' : 'h-0.5 w-8'}
          bg-border
          group-hover:bg-primary
          group-active:bg-primary
          group-data-[resize-handle-active]:bg-primary
          rounded-full
          transition-colors duration-150
        `}
      />
    </Separator>
  );
}

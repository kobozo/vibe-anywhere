'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableTabItemProps {
  id: string;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * Wrapper component that makes its children draggable using @dnd-kit
 * Used to wrap individual tabs and tab groups in the tab bar
 */
export function SortableTabItem({
  id,
  disabled = false,
  children,
}: SortableTabItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={disabled ? '' : 'cursor-grab active:cursor-grabbing'}
      {...attributes}
      {...(disabled ? {} : listeners)}
    >
      {children}
    </div>
  );
}

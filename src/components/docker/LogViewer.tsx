'use client';

import { useEffect, useRef } from 'react';
import type { DockerContainer } from '@/types/docker';

interface LogViewerProps {
  container: DockerContainer | null;
  logs: string | null;
  isLoading: boolean;
  onFetchLogs: (containerId: string, tail?: number) => Promise<void>;
}

export function LogViewer({ container, logs, isLoading, onFetchLogs }: LogViewerProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when logs change
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!container) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        <p>Select a container to view logs</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Logs</span>
          <span className="text-xs text-muted-foreground">({container.name})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onFetchLogs(container.id, 100)}
            disabled={isLoading}
            className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors disabled:opacity-50"
          >
            Last 100
          </button>
          <button
            onClick={() => onFetchLogs(container.id, 500)}
            disabled={isLoading}
            className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors disabled:opacity-50"
          >
            Last 500
          </button>
          <button
            onClick={() => onFetchLogs(container.id, 1000)}
            disabled={isLoading}
            className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors disabled:opacity-50"
          >
            Last 1000
          </button>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-auto bg-[#1e1e1e] font-mono text-xs"
      >
        {isLoading ? (
          <div className="p-4 text-muted-foreground">Loading logs...</div>
        ) : logs ? (
          <pre className="p-4 whitespace-pre-wrap text-[#d4d4d4]">{logs}</pre>
        ) : (
          <div className="p-4 text-muted-foreground">
            Click a button above to fetch logs
          </div>
        )}
      </div>
    </div>
  );
}

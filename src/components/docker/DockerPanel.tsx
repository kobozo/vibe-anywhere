'use client';

import { useDockerPanel } from '@/hooks/useDockerPanel';
import { DockerStatusHeader } from './DockerStatusHeader';
import { ContainerList } from './ContainerList';
import { PortLinks } from './PortLinks';
import { LogViewer } from './LogViewer';

interface DockerPanelProps {
  workspaceId: string;
  containerIp: string | null;
}

export function DockerPanel({ workspaceId, containerIp }: DockerPanelProps) {
  const {
    status,
    selectedContainer,
    containerLogs,
    isLoading,
    isLoadingLogs,
    isActionPending,
    error,
    lastRefresh,
    refresh,
    selectContainer,
    fetchLogs,
    startContainer,
    stopContainer,
    restartContainer,
    getPortUrl,
    clearError,
  } = useDockerPanel({ workspaceId, containerIp });

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <DockerStatusHeader
        containerCount={status?.containers.length ?? 0}
        runningCount={status?.containers.filter(c => c.state === 'running').length ?? 0}
        isLoading={isLoading}
        lastRefresh={lastRefresh}
        onRefresh={refresh}
      />

      {/* Error display */}
      {error && (
        <div className="px-4 py-2 bg-error/30 border-b border-error/50 flex items-center justify-between">
          <span className="text-error text-sm">{error}</span>
          <button
            onClick={clearError}
            className="text-error hover:text-error/80 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Container list panel */}
        <div className="w-80 flex-shrink-0 border-r border-border overflow-y-auto">
          <ContainerList
            containers={status?.containers ?? []}
            selectedContainer={selectedContainer}
            onSelectContainer={selectContainer}
            onStart={startContainer}
            onStop={stopContainer}
            onRestart={restartContainer}
            isActionPending={isActionPending}
          />
        </div>

        {/* Details panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Port links for selected container */}
          {selectedContainer && selectedContainer.ports.length > 0 && (
            <PortLinks ports={selectedContainer.ports} getPortUrl={getPortUrl} />
          )}

          {/* Log viewer */}
          <div className="flex-1 overflow-y-auto">
            <LogViewer
              container={selectedContainer}
              logs={containerLogs}
              isLoading={isLoadingLogs}
              onFetchLogs={fetchLogs}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

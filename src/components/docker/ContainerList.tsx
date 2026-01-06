'use client';

import type { DockerContainer } from '@/types/docker';

interface ContainerListProps {
  containers: DockerContainer[];
  selectedContainer: DockerContainer | null;
  onSelectContainer: (container: DockerContainer | null) => void;
  onStart: (containerId: string) => Promise<void>;
  onStop: (containerId: string) => Promise<void>;
  onRestart: (containerId: string) => Promise<void>;
  isActionPending: boolean;
}

export function ContainerList({
  containers,
  selectedContainer,
  onSelectContainer,
  onStart,
  onStop,
  onRestart,
  isActionPending,
}: ContainerListProps) {
  const getStateColor = (state: DockerContainer['state']) => {
    switch (state) {
      case 'running':
        return 'bg-success';
      case 'exited':
        return 'bg-muted-foreground';
      case 'paused':
        return 'bg-warning';
      case 'restarting':
        return 'bg-info';
      case 'created':
        return 'bg-muted-foreground';
      case 'dead':
        return 'bg-error';
      default:
        return 'bg-muted-foreground';
    }
  };

  if (containers.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        <p>No Docker containers found.</p>
        <p className="mt-1 text-xs">
          Start containers with docker-compose or docker run.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {containers.map((container) => {
        const isSelected = selectedContainer?.id === container.id;
        const isRunning = container.state === 'running';

        return (
          <div
            key={container.id}
            className={`p-3 cursor-pointer transition-colors ${
              isSelected ? 'bg-accent' : 'hover:bg-muted/50'
            }`}
            onClick={() => onSelectContainer(isSelected ? null : container)}
          >
            {/* Container name and status */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full ${getStateColor(container.state)}`} />
                <span className="font-medium text-sm truncate">{container.name}</span>
              </div>
              <span className="text-xs text-muted-foreground capitalize">
                {container.state}
              </span>
            </div>

            {/* Image name */}
            <div className="text-xs text-muted-foreground truncate mb-2">
              {container.image}
            </div>

            {/* Ports */}
            {container.ports.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {container.ports.map((port, idx) => (
                  <span
                    key={idx}
                    className="px-1.5 py-0.5 text-xs bg-muted rounded"
                  >
                    {port.hostPort}:{port.containerPort}
                  </span>
                ))}
              </div>
            )}

            {/* Status text */}
            <div className="text-xs text-muted-foreground mb-2">
              {container.status}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {isRunning ? (
                <>
                  <button
                    onClick={() => onStop(container.id)}
                    disabled={isActionPending}
                    className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors disabled:opacity-50"
                  >
                    Stop
                  </button>
                  <button
                    onClick={() => onRestart(container.id)}
                    disabled={isActionPending}
                    className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors disabled:opacity-50"
                  >
                    Restart
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onStart(container.id)}
                  disabled={isActionPending}
                  className="px-2 py-1 text-xs bg-success/20 hover:bg-success/30 text-success rounded transition-colors disabled:opacity-50"
                >
                  Start
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

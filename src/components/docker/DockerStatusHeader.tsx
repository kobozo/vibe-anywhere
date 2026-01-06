'use client';

interface DockerStatusHeaderProps {
  containerCount: number;
  runningCount: number;
  isLoading: boolean;
  lastRefresh: Date | null;
  onRefresh: () => void;
}

export function DockerStatusHeader({
  containerCount,
  runningCount,
  isLoading,
  lastRefresh,
  onRefresh,
}: DockerStatusHeaderProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
      <div className="flex items-center gap-3">
        {/* Docker icon */}
        <svg className="w-5 h-5 text-info" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.186.186 0 00-.185.186v1.887c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.186.186 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.186.186 0 00-.185.185v1.887c0 .102.082.186.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.186.186 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.186.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.186.186 0 00-.185.186v1.887c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.186v1.887c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186h-2.12a.186.186 0 00-.185.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m10.81 2.715h2.119a.185.185 0 00.185-.185v-1.888a.185.185 0 00-.185-.185h-2.119a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-8.838-6.19c-.076-.025-.175-.034-.282-.034h-2.119a.186.186 0 00-.185.185v1.888c0 .102.083.185.185.185h2.119a.186.186 0 00.185-.185V6.29a.18.18 0 00-.095-.158c.024.008-.053-.027-.053-.027zm12.253 6.19c-.076-.024-.174-.034-.282-.034h-2.118a.186.186 0 00-.186.186v1.887c0 .102.083.185.186.185h2.118a.185.185 0 00.185-.185v-1.887a.18.18 0 00-.094-.158c.024.008-.053-.028-.053-.028h.244v-.016z" />
        </svg>

        {/* Container counts */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {containerCount} container{containerCount !== 1 ? 's' : ''}
          </span>
          {containerCount > 0 && (
            <span className="text-xs text-muted-foreground">
              ({runningCount} running)
            </span>
          )}
        </div>

        {/* Status badges */}
        {containerCount === 0 && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
            No containers
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Last refresh time */}
        {lastRefresh && (
          <span className="text-xs text-muted-foreground">
            Updated {formatTime(lastRefresh)}
          </span>
        )}

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <svg
            className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

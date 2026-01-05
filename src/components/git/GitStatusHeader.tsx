'use client';

interface GitStatusHeaderProps {
  branch: string | undefined;
  isClean: boolean | undefined;
  stagedCount: number;
  unstagedCount: number;
  isLoading: boolean;
  lastRefresh: Date | null;
  onRefresh: () => void;
}

export function GitStatusHeader({
  branch,
  isClean,
  stagedCount,
  unstagedCount,
  isLoading,
  lastRefresh,
  onRefresh,
}: GitStatusHeaderProps) {
  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    return date.toLocaleTimeString();
  };

  return (
    <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between bg-gray-800/50">
      <div className="flex items-center gap-4">
        {/* Branch name */}
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3-3 3 3m0 6l-3 3-3-3" />
          </svg>
          <span className="font-medium text-white">
            {branch || 'Loading...'}
          </span>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2">
          {stagedCount > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-green-600/20 text-green-400">
              {stagedCount} staged
            </span>
          )}
          {unstagedCount > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-600/20 text-yellow-400">
              {unstagedCount} changes
            </span>
          )}
          {isClean && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-600/20 text-blue-400">
              Clean
            </span>
          )}
        </div>
      </div>

      {/* Refresh button and status */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">
          Last updated: {formatTime(lastRefresh)}
        </span>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
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

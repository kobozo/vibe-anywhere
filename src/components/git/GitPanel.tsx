'use client';

import { useGitPanel } from '@/hooks/useGitPanel';
import { GitStatusHeader } from './GitStatusHeader';
import { FileList } from './FileList';
import { DiffViewer } from './DiffViewer';
import { CommitForm } from './CommitForm';

interface GitPanelProps {
  workspaceId: string;
}

export function GitPanel({ workspaceId }: GitPanelProps) {
  const {
    status,
    selectedFile,
    selectedFileDiff,
    isLoading,
    isStaging,
    isCommitting,
    isDiscarding,
    error,
    lastRefresh,
    refresh,
    selectFile,
    stageFiles,
    stageAll,
    unstageFiles,
    unstageAll,
    discardFiles,
    discardAll,
    commit,
    clearError,
  } = useGitPanel({ workspaceId });

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100 overflow-hidden">
      {/* Header */}
      <GitStatusHeader
        branch={status?.branch}
        isClean={status?.isClean}
        stagedCount={status?.staged.length ?? 0}
        unstagedCount={(status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0)}
        isLoading={isLoading}
        lastRefresh={lastRefresh}
        onRefresh={refresh}
      />

      {/* Error display */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800/50 flex items-center justify-between">
          <span className="text-red-400 text-sm">{error}</span>
          <button
            onClick={clearError}
            className="text-red-400 hover:text-red-300 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* File list panel */}
        <div className="w-80 flex-shrink-0 border-r border-gray-700 overflow-y-auto">
          <FileList
            staged={status?.staged ?? []}
            unstaged={status?.unstaged ?? []}
            untracked={status?.untracked ?? []}
            selectedFile={selectedFile}
            onSelectFile={selectFile}
            onStageFiles={stageFiles}
            onUnstageFiles={unstageFiles}
            onDiscardFiles={discardFiles}
            onStageAll={stageAll}
            onUnstageAll={unstageAll}
            onDiscardAll={discardAll}
            isStaging={isStaging}
            isDiscarding={isDiscarding}
          />
        </div>

        {/* Diff viewer panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <DiffViewer
              file={selectedFile}
              diff={selectedFileDiff}
              isLoading={isLoading && selectedFile !== null}
            />
          </div>

          {/* Commit form */}
          <div className="border-t border-gray-700">
            <CommitForm
              stagedCount={status?.staged.length ?? 0}
              onCommit={commit}
              isCommitting={isCommitting}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

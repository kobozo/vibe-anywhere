'use client';

import { useState } from 'react';
import { useGitPanel } from '@/hooks/useGitPanel';
import { GitStatusHeader } from './GitStatusHeader';
import { FileList } from './FileList';
import { DiffViewer } from './DiffViewer';
import { CommitForm } from './CommitForm';
import { GitHooksModal } from './GitHooksModal';

interface GitPanelProps {
  workspaceId: string;
}

export function GitPanel({ workspaceId }: GitPanelProps) {
  const [hooksModalOpen, setHooksModalOpen] = useState(false);

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
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <GitStatusHeader
        branch={status?.branch}
        isClean={status?.isClean}
        stagedCount={status?.staged.length ?? 0}
        unstagedCount={(status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0)}
        isLoading={isLoading}
        lastRefresh={lastRefresh}
        onRefresh={refresh}
        onOpenHooks={() => setHooksModalOpen(true)}
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
        {/* File list panel */}
        <div className="w-80 flex-shrink-0 border-r border-border overflow-y-auto">
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
          <div className="border-t border-border">
            <CommitForm
              stagedCount={status?.staged.length ?? 0}
              onCommit={commit}
              isCommitting={isCommitting}
            />
          </div>
        </div>
      </div>

      {/* Git Hooks Modal */}
      <GitHooksModal
        workspaceId={workspaceId}
        isOpen={hooksModalOpen}
        onClose={() => setHooksModalOpen(false)}
      />
    </div>
  );
}

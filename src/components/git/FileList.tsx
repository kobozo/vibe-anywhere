'use client';

import type { FileChange } from '@/types/git';

interface FileListProps {
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
  selectedFile: string | null;
  onSelectFile: (path: string | null) => void;
  onStageFiles: (files: string[]) => Promise<void>;
  onUnstageFiles: (files: string[]) => Promise<void>;
  onDiscardFiles: (files: string[]) => Promise<void>;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  onDiscardAll: () => Promise<void>;
  isStaging: boolean;
  isDiscarding: boolean;
}

function getStatusIcon(status: FileChange['status']) {
  switch (status) {
    case 'added':
      return <span className="text-green-400">A</span>;
    case 'modified':
      return <span className="text-yellow-400">M</span>;
    case 'deleted':
      return <span className="text-red-400">D</span>;
    case 'renamed':
      return <span className="text-blue-400">R</span>;
    case 'copied':
      return <span className="text-purple-400">C</span>;
    default:
      return <span className="text-gray-400">?</span>;
  }
}

function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

function getFileDir(path: string): string {
  const parts = path.split('/');
  if (parts.length > 1) {
    return parts.slice(0, -1).join('/') + '/';
  }
  return '';
}

interface FileItemProps {
  path: string;
  status?: FileChange['status'];
  isSelected: boolean;
  onSelect: () => void;
  actionIcon: 'stage' | 'unstage';
  onAction: () => void;
  onDiscard?: () => void;
  isActionDisabled: boolean;
  isDiscardDisabled?: boolean;
}

function FileItem({
  path,
  status,
  isSelected,
  onSelect,
  actionIcon,
  onAction,
  onDiscard,
  isActionDisabled,
  isDiscardDisabled,
}: FileItemProps) {
  const dir = getFileDir(path);
  const name = getFileName(path);

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-800 ${
        isSelected ? 'bg-gray-800' : ''
      }`}
      onClick={onSelect}
    >
      <span className="w-4 text-center font-mono text-xs">
        {status ? getStatusIcon(status) : <span className="text-green-400">?</span>}
      </span>
      <div className="flex-1 min-w-0 truncate">
        {dir && <span className="text-gray-500">{dir}</span>}
        <span className="text-gray-200">{name}</span>
      </div>
      <div className="flex items-center gap-1">
        {onDiscard && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            disabled={isDiscardDisabled}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-700 disabled:opacity-50 transition-opacity"
            title="Discard changes"
          >
            <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          disabled={isActionDisabled}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-700 disabled:opacity-50 transition-opacity"
          title={actionIcon === 'stage' ? 'Stage file' : 'Unstage file'}
        >
          {actionIcon === 'stage' ? (
            <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

export function FileList({
  staged,
  unstaged,
  untracked,
  selectedFile,
  onSelectFile,
  onStageFiles,
  onUnstageFiles,
  onDiscardFiles,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
  isStaging,
  isDiscarding,
}: FileListProps) {
  const hasChanges = staged.length > 0 || unstaged.length > 0 || untracked.length > 0;

  if (!hasChanges) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 p-4 text-center">
        <div>
          <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>Working tree clean</p>
          <p className="text-sm mt-1">No changes to commit</p>
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm">
      {/* Staged Changes */}
      {staged.length > 0 && (
        <div className="border-b border-gray-700">
          <div className="px-3 py-2 flex items-center justify-between bg-gray-800/50">
            <span className="text-green-400 font-medium">
              Staged Changes ({staged.length})
            </span>
            <button
              onClick={onUnstageAll}
              disabled={isStaging}
              className="text-xs text-gray-400 hover:text-white disabled:opacity-50"
            >
              Unstage All
            </button>
          </div>
          {staged.map((file) => (
            <FileItem
              key={`staged-${file.path}`}
              path={file.path}
              status={file.status}
              isSelected={selectedFile === file.path}
              onSelect={() => onSelectFile(file.path)}
              actionIcon="unstage"
              onAction={() => onUnstageFiles([file.path])}
              isActionDisabled={isStaging}
            />
          ))}
        </div>
      )}

      {/* Unstaged Changes */}
      {unstaged.length > 0 && (
        <div className="border-b border-gray-700">
          <div className="px-3 py-2 flex items-center justify-between bg-gray-800/50">
            <span className="text-yellow-400 font-medium">
              Changes ({unstaged.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onDiscardAll}
                disabled={isStaging || isDiscarding}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                title="Discard all changes"
              >
                Discard All
              </button>
              <button
                onClick={() => onStageFiles(unstaged.map(f => f.path))}
                disabled={isStaging || isDiscarding}
                className="text-xs text-gray-400 hover:text-white disabled:opacity-50"
              >
                Stage All
              </button>
            </div>
          </div>
          {unstaged.map((file) => (
            <FileItem
              key={`unstaged-${file.path}`}
              path={file.path}
              status={file.status}
              isSelected={selectedFile === file.path}
              onSelect={() => onSelectFile(file.path)}
              actionIcon="stage"
              onAction={() => onStageFiles([file.path])}
              onDiscard={() => onDiscardFiles([file.path])}
              isActionDisabled={isStaging || isDiscarding}
              isDiscardDisabled={isDiscarding || isStaging}
            />
          ))}
        </div>
      )}

      {/* Untracked Files */}
      {untracked.length > 0 && (
        <div>
          <div className="px-3 py-2 flex items-center justify-between bg-gray-800/50">
            <span className="text-gray-400 font-medium">
              Untracked ({untracked.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDiscardFiles(untracked)}
                disabled={isStaging || isDiscarding}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                title="Delete all untracked files"
              >
                Delete All
              </button>
              <button
                onClick={() => onStageFiles(untracked)}
                disabled={isStaging || isDiscarding}
                className="text-xs text-gray-400 hover:text-white disabled:opacity-50"
              >
                Stage All
              </button>
            </div>
          </div>
          {untracked.map((path) => (
            <FileItem
              key={`untracked-${path}`}
              path={path}
              isSelected={selectedFile === path}
              onSelect={() => onSelectFile(path)}
              actionIcon="stage"
              onAction={() => onStageFiles([path])}
              onDiscard={() => onDiscardFiles([path])}
              isActionDisabled={isStaging || isDiscarding}
              isDiscardDisabled={isDiscarding || isStaging}
            />
          ))}
        </div>
      )}
    </div>
  );
}

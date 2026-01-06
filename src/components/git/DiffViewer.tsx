'use client';

interface DiffViewerProps {
  file: string | null;
  diff: string | null;
  isLoading: boolean;
}

function parseDiffLine(line: string): { type: 'add' | 'remove' | 'context' | 'header' | 'info'; content: string } {
  if (line.startsWith('+++') || line.startsWith('---')) {
    return { type: 'header', content: line };
  }
  if (line.startsWith('@@')) {
    return { type: 'info', content: line };
  }
  if (line.startsWith('+')) {
    return { type: 'add', content: line };
  }
  if (line.startsWith('-')) {
    return { type: 'remove', content: line };
  }
  return { type: 'context', content: line };
}

function getLineStyle(type: 'add' | 'remove' | 'context' | 'header' | 'info'): string {
  switch (type) {
    case 'add':
      return 'bg-success/20 text-success';
    case 'remove':
      return 'bg-error/20 text-error';
    case 'header':
      return 'text-foreground-secondary font-bold';
    case 'info':
      return 'bg-primary/20 text-primary';
    default:
      return 'text-foreground';
  }
}

export function DiffViewer({ file, diff, isLoading }: DiffViewerProps) {
  if (!file) {
    return (
      <div className="flex items-center justify-center h-full text-foreground-tertiary p-4 text-center">
        <div>
          <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>Select a file to view diff</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-foreground-tertiary">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Loading diff...
        </div>
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex items-center justify-center h-full text-foreground-tertiary p-4 text-center">
        <div>
          <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>No diff available</p>
          <p className="text-sm mt-1">This may be a new or untracked file</p>
        </div>
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <div className="h-full overflow-auto">
      {/* File header */}
      <div className="sticky top-0 bg-background-secondary border-b border-border px-4 py-2 font-mono text-sm">
        <span className="text-foreground-secondary">{file}</span>
      </div>

      {/* Diff content */}
      <pre className="font-mono text-xs leading-relaxed">
        {lines.map((line, index) => {
          const { type, content } = parseDiffLine(line);
          return (
            <div
              key={index}
              className={`px-4 py-0.5 ${getLineStyle(type)}`}
            >
              {content || ' '}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

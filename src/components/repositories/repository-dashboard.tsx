'use client';

import { useEffect, useState } from 'react';
import type { Repository, SSHKey, ProxmoxTemplate } from '@/lib/db/schema';
import { useRepositoryBranches } from '@/hooks/useRepositoryBranches';

interface GitHook {
  name: string;
  path: string;
  enabled: boolean;
}

interface Remote {
  name: string;
  url: string;
  type: string;
}

interface LastCommit {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  date: string;
}

interface RepoStats {
  commitCount: number;
  branchCount: number;
}

interface GitIdentityInfo {
  name: string;
  gitName: string;
  gitEmail: string;
  isDefault: boolean;
}

interface RepositoryDetails {
  repository: Repository;
  branches: string[];
  sshKey: SSHKey | null;
  template: ProxmoxTemplate | null;
  hooks: GitHook[];
  remotes: Remote[];
  lastCommit: LastCommit | null;
  stats: RepoStats | null;
  gitIdentity: GitIdentityInfo | null;
}

interface RepositoryDashboardProps {
  repository: Repository;
  onBranchClick?: (branch: string) => void;
}

export function RepositoryDashboard({ repository, onBranchClick }: RepositoryDashboardProps) {
  const [details, setDetails] = useState<RepositoryDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Use hook for branches with WebSocket updates
  const {
    branches: liveBranches,
    isRefreshing: branchesRefreshing,
  } = useRepositoryBranches({
    repositoryId: repository.id,
  });

  useEffect(() => {
    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/repositories/${repository.id}/details`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch repository details');
        }

        const { data } = await response.json();
        setDetails(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [repository.id]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-foreground-secondary">
        Loading repository details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-error">
        Error: {error}
      </div>
    );
  }

  if (!details) {
    return null;
  }

  const { sshKey, template, hooks, remotes, lastCommit, stats, gitIdentity } = details;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-background-secondary rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                {repository.name}
              </h1>
              {repository.description && (
                <p className="text-foreground-secondary mt-2">{repository.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 text-xs rounded bg-primary/20 text-primary">
                {repository.cloneDepth ? `Shallow (depth=${repository.cloneDepth})` : 'Full Clone'}
              </span>
            </div>
          </div>

          {/* Quick stats */}
          {stats && (
            <div className="flex gap-6 mt-4 pt-4 border-t border-border">
              <div>
                <span className="text-foreground-secondary text-sm">Commits</span>
                <p className="text-foreground text-lg font-semibold">{stats.commitCount.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-foreground-secondary text-sm">Branches</span>
                <p className="text-foreground text-lg font-semibold">{stats.branchCount}</p>
              </div>
              <div>
                <span className="text-foreground-secondary text-sm">Default Branch</span>
                <p className="text-foreground text-lg font-semibold">{repository.defaultBranch || 'main'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Last Commit */}
        {lastCommit && (
          <div className="bg-background-secondary rounded-lg p-4">
            <h2 className="text-sm font-medium text-foreground-secondary mb-3">Last Commit</h2>
            <div className="flex items-start gap-3">
              <span className="text-foreground-tertiary font-mono text-sm">{lastCommit.shortHash}</span>
              <div className="flex-1">
                <p className="text-foreground">{lastCommit.subject}</p>
                <p className="text-foreground-tertiary text-sm mt-1">
                  {lastCommit.authorName} &bull; {new Date(lastCommit.date).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Two column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Remote URLs */}
          <div className="bg-background-secondary rounded-lg p-4">
            <h2 className="text-sm font-medium text-foreground-secondary mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Remote URLs
            </h2>
            {remotes.length > 0 ? (
              <div className="space-y-2">
                {remotes.map((remote) => (
                  <div key={remote.name} className="flex items-center gap-2">
                    <span className="text-primary text-sm font-medium">{remote.name}</span>
                    <span className="text-foreground-tertiary font-mono text-xs truncate flex-1">{remote.url}</span>
                  </div>
                ))}
              </div>
            ) : repository.cloneUrl ? (
              <div className="flex items-center gap-2">
                <span className="text-primary text-sm font-medium">origin</span>
                <span className="text-foreground-tertiary font-mono text-xs truncate flex-1">{repository.cloneUrl}</span>
              </div>
            ) : (
              <p className="text-foreground-tertiary text-sm">No remotes configured</p>
            )}
          </div>

          {/* SSH Key */}
          <div className="bg-background-secondary rounded-lg p-4">
            <h2 className="text-sm font-medium text-foreground-secondary mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              SSH Key
            </h2>
            {sshKey ? (
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span className="text-foreground">{sshKey.name}</span>
                <span className="text-foreground-tertiary text-xs px-2 py-0.5 bg-background-tertiary rounded">{sshKey.keyType.toUpperCase()}</span>
                <button
                  onClick={async () => {
                    try {
                      if (!navigator.clipboard) {
                        throw new Error('Clipboard API not available. Please use HTTPS or localhost.');
                      }
                      await navigator.clipboard.writeText(sshKey.publicKey);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    } catch (err) {
                      console.error('Failed to copy:', err);
                    }
                  }}
                  className="text-xs px-2 py-1 bg-primary hover:bg-primary-hover text-foreground rounded transition-colors"
                >
                  {copiedKey ? 'Copied!' : 'Copy Public Key'}
                </button>
              </div>
            ) : (
              <p className="text-foreground-tertiary text-sm">No SSH key configured for this repository</p>
            )}
          </div>

          {/* Tech Stack & Template (merged) */}
          <div className="bg-background-secondary rounded-lg p-4">
            <h2 className="text-sm font-medium text-foreground-secondary mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Tech Stack
            </h2>
            <div className="space-y-3">
              {/* Template info */}
              {template && (
                <div className="flex items-center gap-2">
                  <span className="text-foreground-tertiary text-sm">Template:</span>
                  <span className="text-foreground">{template.name}</span>
                </div>
              )}

              {/* Combined tech stacks */}
              {(() => {
                const templateStacks: string[] = Array.isArray(template?.techStacks) ? template.techStacks : [];
                const repoStacks: string[] = Array.isArray(repository.techStack) ? repository.techStack : [];
                const allStacks: string[] = [...new Set([...templateStacks, ...repoStacks])];

                if (allStacks.length > 0) {
                  return (
                    <div className="flex flex-wrap gap-2">
                      {allStacks.map((tech) => {
                        const isFromRepo = repoStacks.includes(tech);
                        const isFromTemplate = templateStacks.includes(tech);
                        return (
                          <span
                            key={tech}
                            className={`px-3 py-1 text-sm rounded-full ${
                              isFromRepo && !isFromTemplate
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-background-tertiary text-foreground'
                            }`}
                            title={isFromRepo && !isFromTemplate ? 'Repository override' : 'From template'}
                          >
                            {tech}
                          </span>
                        );
                      })}
                    </div>
                  );
                }
                return <p className="text-foreground-tertiary text-sm">No tech stack configured</p>;
              })()}
            </div>
          </div>

          {/* Git Identity */}
          <div className="bg-background-secondary rounded-lg p-4">
            <h2 className="text-sm font-medium text-foreground-secondary mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Git Identity
            </h2>
            {gitIdentity ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-foreground">{gitIdentity.gitName}</span>
                  {gitIdentity.isDefault && (
                    <span className="text-xs px-1.5 py-0.5 bg-success/20 text-success rounded">default</span>
                  )}
                  {gitIdentity.name === 'Custom' && (
                    <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">custom</span>
                  )}
                </div>
                <p className="text-foreground-tertiary text-sm">&lt;{gitIdentity.gitEmail}&gt;</p>
              </div>
            ) : (
              <p className="text-foreground-tertiary text-sm">Using default identity</p>
            )}
          </div>
        </div>

        {/* Git Hooks */}
        <div className="bg-background-secondary rounded-lg p-4">
          <h2 className="text-sm font-medium text-foreground-secondary mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
            Git Hooks
          </h2>
          {hooks.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {hooks.map((hook) => (
                <div
                  key={hook.name}
                  className={`flex items-center gap-2 px-3 py-2 rounded ${
                    hook.enabled ? 'bg-success/10 border border-success/30' : 'bg-background-tertiary/50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${hook.enabled ? 'bg-success' : 'bg-foreground-tertiary'}`} />
                  <span className={`text-sm ${hook.enabled ? 'text-success' : 'text-foreground-secondary'}`}>
                    {hook.name}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-foreground-tertiary text-sm">No git hooks installed</p>
          )}
        </div>

        {/* Branches - use liveBranches from hook for real-time updates */}
        {liveBranches.length > 0 && (
          <div className="bg-background-secondary rounded-lg p-4">
            <h2 className="text-sm font-medium text-foreground-secondary mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3-3 3 3m0 6l-3 3-3-3" />
              </svg>
              Branches ({liveBranches.length})
              {branchesRefreshing && (
                <span className="text-xs text-foreground-tertiary animate-pulse ml-2">
                  Refreshing...
                </span>
              )}
            </h2>
            <p className="text-xs text-foreground-tertiary mb-3">
              Click a branch to create a new workspace
            </p>
            <div className="flex flex-wrap gap-2">
              {liveBranches.slice(0, 20).map((branch) => {
                const maxLength = 25;
                const displayName = branch.length > maxLength
                  ? `${branch.slice(0, maxLength)}...`
                  : branch;
                return (
                  <button
                    key={branch}
                    onClick={() => onBranchClick?.(branch)}
                    title={branch.length > maxLength ? branch : undefined}
                    className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${
                      branch === repository.defaultBranch
                        ? 'bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30'
                        : 'bg-background-tertiary text-foreground hover:bg-background-input'
                    }`}
                  >
                    {displayName}
                  </button>
                );
              })}
              {liveBranches.length > 20 && (
                <span className="px-2 py-1 text-xs text-foreground-tertiary">
                  +{liveBranches.length - 20} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Repository Info */}
        <div className="bg-background-secondary rounded-lg p-4">
          <h2 className="text-sm font-medium text-foreground-secondary mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Repository Info
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-foreground-tertiary">Created</span>
              <p className="text-foreground">{new Date(repository.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <span className="text-foreground-tertiary">Last Updated</span>
              <p className="text-foreground">{new Date(repository.updatedAt).toLocaleDateString()}</p>
            </div>
            <div className="col-span-2">
              <span className="text-foreground-tertiary">Clone URL</span>
              <p className="text-foreground font-mono text-xs truncate">{repository.cloneUrl}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

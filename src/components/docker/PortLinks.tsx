'use client';

import type { DockerPort } from '@/types/docker';

interface PortLinksProps {
  ports: DockerPort[];
  getPortUrl: (port: number) => string;
}

export function PortLinks({ ports, getPortUrl }: PortLinksProps) {
  if (ports.length === 0) {
    return null;
  }

  const handlePortClick = (port: number) => {
    const url = getPortUrl(port);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="px-4 py-3 border-b border-border bg-muted/20">
      <div className="text-xs text-muted-foreground mb-2">Exposed Ports</div>
      <div className="flex flex-wrap gap-2">
        {ports.map((port, idx) => (
          <button
            key={idx}
            onClick={() => handlePortClick(port.hostPort)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-info/10 hover:bg-info/20 text-info rounded-md transition-colors text-sm font-medium"
            title={`Open ${getPortUrl(port.hostPort)} in new tab`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            <span>:{port.hostPort}</span>
            {port.containerPort !== port.hostPort && (
              <span className="text-xs text-muted-foreground">
                ({port.containerPort})
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

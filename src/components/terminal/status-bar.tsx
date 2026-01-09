'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useTheme } from '@/lib/theme';

// Simple SVG icons
function CpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
      <rect x="9" y="9" width="6" height="6"/>
      <line x1="9" y1="1" x2="9" y2="4"/>
      <line x1="15" y1="1" x2="15" y2="4"/>
      <line x1="9" y1="20" x2="9" y2="23"/>
      <line x1="15" y1="20" x2="15" y2="23"/>
      <line x1="20" y1="9" x2="23" y2="9"/>
      <line x1="20" y1="15" x2="23" y2="15"/>
      <line x1="1" y1="9" x2="4" y2="9"/>
      <line x1="1" y1="15" x2="4" y2="15"/>
    </svg>
  );
}

function MemoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" ry="2"/>
      <line x1="6" y1="10" x2="6" y2="14"/>
      <line x1="10" y1="10" x2="10" y2="14"/>
      <line x1="14" y1="10" x2="14" y2="14"/>
      <line x1="18" y1="10" x2="18" y2="14"/>
    </svg>
  );
}

function ImagePlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
      <line x1="14" y1="4" x2="14" y2="10"/>
      <line x1="11" y1="7" x2="17" y2="7"/>
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 11-6.219-8.56"/>
    </svg>
  );
}

function DiskIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  );
}

interface StatusBarProps {
  workspaceId: string;
  tabId: string;
  socket: Socket | null;
  isConnected: boolean;
  terminalBackground?: string | null;
}

interface ContainerStats {
  cpu: number; // percentage
  memory: {
    used: number; // MB
    total: number; // MB
    percentage: number;
  };
  disk: {
    used: number; // GB
    total: number; // GB
    percentage: number;
  };
}

export function StatusBar({ workspaceId, tabId, socket, isConnected, terminalBackground }: StatusBarProps) {
  const { theme } = useTheme();
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Request stats from agent
  const requestStats = useCallback(() => {
    if (socket && isConnected && workspaceId) {
      const requestId = `stats-${Date.now()}`;
      socket.emit('stats:request', { requestId, workspaceId });
    }
  }, [socket, isConnected, workspaceId]);

  // Handle stats response
  useEffect(() => {
    if (!socket) return;

    const handleStatsResponse = (data: { requestId: string; success: boolean; stats?: ContainerStats; error?: string }) => {
      if (data.success && data.stats) {
        setStats(data.stats);
      }
    };

    socket.on('stats:response', handleStatsResponse);

    return () => {
      socket.off('stats:response', handleStatsResponse);
    };
  }, [socket]);

  // Poll stats every 5 seconds
  useEffect(() => {
    if (isConnected) {
      // Initial request
      requestStats();

      // Set up polling
      statsIntervalRef.current = setInterval(requestStats, 5000);
    }

    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
    };
  }, [isConnected, requestStats]);

  // Handle image upload
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket) return;

    // Only allow images
    if (!file.type.startsWith('image/')) {
      console.error('Only image files are allowed');
      return;
    }

    setIsUploading(true);

    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const requestId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Listen for upload response
      const handleUploadResponse = (data: { requestId: string; success: boolean; filePath?: string; error?: string }) => {
        if (data.requestId === requestId) {
          setIsUploading(false);
          socket.off('file:uploaded', handleUploadResponse);
        }
      };
      socket.on('file:uploaded', handleUploadResponse);

      // Send upload request
      socket.emit('file:upload', {
        requestId,
        tabId,
        filename: file.name,
        data: base64,
        mimeType: file.type,
      });

      // Timeout fallback
      setTimeout(() => {
        setIsUploading(false);
        socket.off('file:uploaded', handleUploadResponse);
      }, 30000);

    } catch (error) {
      console.error('Upload failed:', error);
      setIsUploading(false);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className="flex items-center justify-between px-3 py-1 text-xs shrink-0"
      style={{
        backgroundColor: terminalBackground || theme.terminal.background,
        borderTop: `1px solid ${theme.colors.border}`,
        color: theme.colors.foregroundTertiary,
      }}
    >
      {/* Stats section */}
      <div className="flex items-center gap-4">
        {/* CPU */}
        <div className="flex items-center gap-1.5">
          <CpuIcon className="w-3 h-3" />
          <span>
            {stats ? `${stats.cpu.toFixed(1)}%` : '--'}
          </span>
        </div>

        {/* Memory */}
        <div className="flex items-center gap-1.5">
          <MemoryIcon className="w-3 h-3" />
          <span>
            {stats
              ? `${stats.memory.used}MB / ${stats.memory.total}MB`
              : '--'
            }
          </span>
        </div>

        {/* Disk */}
        <div className="flex items-center gap-1.5">
          <DiskIcon className="w-3 h-3" />
          <span>
            {stats
              ? `${stats.disk.used}GB / ${stats.disk.total}GB (${stats.disk.percentage.toFixed(0)}%)`
              : '--'
            }
          </span>
        </div>
      </div>

      {/* Upload section */}
      <div className="flex items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />
        <button
          onClick={triggerFileSelect}
          disabled={!isConnected || isUploading}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{
            color: theme.colors.foregroundTertiary,
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.backgroundTertiary}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          title="Upload image (pastes file path into terminal)"
        >
          {isUploading ? (
            <SpinnerIcon className="w-3 h-3 animate-spin" />
          ) : (
            <ImagePlusIcon className="w-3 h-3" />
          )}
          <span>Upload Image</span>
        </button>
      </div>
    </div>
  );
}

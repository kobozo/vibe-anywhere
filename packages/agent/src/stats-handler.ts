/**
 * Stats Handler
 * Collects CPU and memory statistics from Linux /proc filesystem
 */

import * as fs from 'fs';

interface CpuTimes {
  user: number;
  nice: number;
  system: number;
  idle: number;
  iowait: number;
  irq: number;
  softirq: number;
  steal: number;
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

export class StatsHandler {
  private lastCpuTimes: CpuTimes | null = null;

  /**
   * Get current container stats
   */
  async getStats(): Promise<ContainerStats> {
    const [cpu, memory, disk] = await Promise.all([
      this.getCpuUsage(),
      this.getMemoryUsage(),
      this.getDiskUsage(),
    ]);

    return { cpu, memory, disk };
  }

  /**
   * Read CPU usage from /proc/stat
   * Returns percentage (0-100)
   */
  private async getCpuUsage(): Promise<number> {
    try {
      const stat = fs.readFileSync('/proc/stat', 'utf8');
      const lines = stat.split('\n');
      const cpuLine = lines.find(line => line.startsWith('cpu '));

      if (!cpuLine) {
        return 0;
      }

      // cpu  user nice system idle iowait irq softirq steal guest guest_nice
      const parts = cpuLine.split(/\s+/).slice(1).map(Number);
      const currentTimes: CpuTimes = {
        user: parts[0] || 0,
        nice: parts[1] || 0,
        system: parts[2] || 0,
        idle: parts[3] || 0,
        iowait: parts[4] || 0,
        irq: parts[5] || 0,
        softirq: parts[6] || 0,
        steal: parts[7] || 0,
      };

      if (!this.lastCpuTimes) {
        this.lastCpuTimes = currentTimes;
        return 0;
      }

      // Calculate deltas
      const deltaUser = currentTimes.user - this.lastCpuTimes.user;
      const deltaNice = currentTimes.nice - this.lastCpuTimes.nice;
      const deltaSystem = currentTimes.system - this.lastCpuTimes.system;
      const deltaIdle = currentTimes.idle - this.lastCpuTimes.idle;
      const deltaIowait = currentTimes.iowait - this.lastCpuTimes.iowait;
      const deltaIrq = currentTimes.irq - this.lastCpuTimes.irq;
      const deltaSoftirq = currentTimes.softirq - this.lastCpuTimes.softirq;
      const deltaSteal = currentTimes.steal - this.lastCpuTimes.steal;

      this.lastCpuTimes = currentTimes;

      const totalDelta = deltaUser + deltaNice + deltaSystem + deltaIdle +
                         deltaIowait + deltaIrq + deltaSoftirq + deltaSteal;

      if (totalDelta === 0) {
        return 0;
      }

      const idleDelta = deltaIdle + deltaIowait;
      const usagePct = ((totalDelta - idleDelta) / totalDelta) * 100;

      return Math.max(0, Math.min(100, usagePct));
    } catch (error) {
      console.error('Failed to read CPU stats:', error);
      return 0;
    }
  }

  /**
   * Read memory usage from /proc/meminfo
   * Returns used and total in MB
   */
  private async getMemoryUsage(): Promise<{ used: number; total: number; percentage: number }> {
    try {
      const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
      const lines = meminfo.split('\n');

      const getValue = (key: string): number => {
        const line = lines.find(l => l.startsWith(key + ':'));
        if (!line) return 0;
        const match = line.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      };

      // All values from /proc/meminfo are in kB
      const totalKb = getValue('MemTotal');
      const freeKb = getValue('MemFree');
      const buffersKb = getValue('Buffers');
      const cachedKb = getValue('Cached');
      const sReclaimableKb = getValue('SReclaimable');

      // Available memory = Free + Buffers + Cached + SReclaimable
      // (this is closer to what 'free -m' shows as "available")
      const availableKb = freeKb + buffersKb + cachedKb + sReclaimableKb;
      const usedKb = totalKb - availableKb;

      const totalMb = Math.round(totalKb / 1024);
      const usedMb = Math.round(usedKb / 1024);
      const percentage = totalKb > 0 ? (usedKb / totalKb) * 100 : 0;

      return {
        used: Math.max(0, usedMb),
        total: totalMb,
        percentage: Math.max(0, Math.min(100, percentage)),
      };
    } catch (error) {
      console.error('Failed to read memory stats:', error);
      return { used: 0, total: 0, percentage: 0 };
    }
  }

  /**
   * Read disk usage for root filesystem
   * Returns used and total in GB
   */
  private async getDiskUsage(): Promise<{ used: number; total: number; percentage: number }> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Use df to get root filesystem stats
      const { stdout } = await execAsync('df -B1 / | tail -1');
      const parts = stdout.trim().split(/\s+/);

      // df output: Filesystem 1B-blocks Used Available Use% Mounted
      if (parts.length >= 5) {
        const totalBytes = parseInt(parts[1], 10) || 0;
        const usedBytes = parseInt(parts[2], 10) || 0;

        const totalGb = Math.round((totalBytes / (1024 * 1024 * 1024)) * 10) / 10;
        const usedGb = Math.round((usedBytes / (1024 * 1024 * 1024)) * 10) / 10;
        const percentage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

        return {
          used: usedGb,
          total: totalGb,
          percentage: Math.max(0, Math.min(100, percentage)),
        };
      }

      return { used: 0, total: 0, percentage: 0 };
    } catch (error) {
      console.error('Failed to read disk stats:', error);
      return { used: 0, total: 0, percentage: 0 };
    }
  }
}

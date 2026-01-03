/**
 * tmux session and window manager
 * Uses tmux commands directly instead of node-pty for better reliability
 */

import { spawn, exec as execCb, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';

const exec = promisify(execCb);

export interface TmuxWindow {
  tabId: string;
  windowIndex: number;
  command: string[];
  outputProcess: ChildProcess | null;
  isEnded: boolean;
}

export interface TmuxManagerEvents {
  onOutput: (tabId: string, data: string) => void;
  onExit: (tabId: string, exitCode: number) => void;
  onError: (tabId: string, error: Error) => void;
}

export class TmuxManager {
  private sessionName: string;
  private windows: Map<string, TmuxWindow> = new Map();
  private initialized: boolean = false;

  constructor(
    workspaceId: string,
    private prefix: string,
    private events: TmuxManagerEvents
  ) {
    this.sessionName = `${prefix}${workspaceId}`;
  }

  /**
   * Initialize the tmux session
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check if tmux is installed
    try {
      await exec('which tmux');
    } catch {
      throw new Error('tmux is not installed');
    }

    // Check if session already exists (recovery scenario)
    try {
      const { stdout } = await exec(`tmux has-session -t ${this.sessionName} 2>&1 && echo "exists"`);
      if (stdout.includes('exists')) {
        console.log(`Recovering existing tmux session: ${this.sessionName}`);
        await this.recoverExistingWindows();
      }
    } catch {
      // Session doesn't exist, create it
      console.log(`Creating new tmux session: ${this.sessionName}`);
      await exec(`tmux new-session -d -s ${this.sessionName} -x 120 -y 30`);
    }

    this.initialized = true;
  }

  /**
   * Recover existing windows from a tmux session
   */
  private async recoverExistingWindows(): Promise<void> {
    try {
      const { stdout } = await exec(
        `tmux list-windows -t ${this.sessionName} -F "#{window_index}:#{window_name}"`
      );

      const windows = stdout.trim().split('\n').filter(Boolean);
      for (const window of windows) {
        const [indexStr, name] = window.split(':');
        const windowIndex = parseInt(indexStr, 10);

        // Window names are formatted as tab_<tabId>
        if (name && name.startsWith('tab_')) {
          const tabId = name.replace('tab_', '');
          this.windows.set(tabId, {
            tabId,
            windowIndex,
            command: [],
            outputProcess: null,
            isEnded: false,
          });
          console.log(`Recovered window ${windowIndex} for tab ${tabId}`);

          // Start capturing output for this window
          this.startOutputCapture(tabId, windowIndex);
        }
      }
    } catch (error) {
      console.error('Failed to recover windows:', error);
    }
  }

  /**
   * Create a new tmux window for a tab
   */
  async createWindow(tabId: string, command: string[]): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check if window already exists
    const existing = this.windows.get(tabId);
    if (existing && !existing.isEnded) {
      console.log(`Window for tab ${tabId} already exists at index ${existing.windowIndex}`);
      return existing.windowIndex;
    }

    // Query tmux for actually existing windows to find next available index
    const usedIndices = new Set<number>();
    try {
      const { stdout } = await exec(
        `tmux list-windows -t ${this.sessionName} -F "#{window_index}"`
      );
      stdout.trim().split('\n').filter(Boolean).forEach(idx => {
        usedIndices.add(parseInt(idx, 10));
      });
    } catch {
      // Session might not have windows, start from 0
    }

    // Also add our tracked windows
    for (const w of this.windows.values()) {
      usedIndices.add(w.windowIndex);
    }

    let windowIndex = 0;
    while (usedIndices.has(windowIndex)) {
      windowIndex++;
    }

    const windowName = `tab_${tabId}`;

    // Create the tmux window (don't specify index, let tmux pick next available)
    // Start in /workspace directory
    await exec(
      `tmux new-window -t ${this.sessionName} -n ${windowName} -c /workspace`
    );

    // Get the actual window index that was created
    try {
      const { stdout } = await exec(
        `tmux list-windows -t ${this.sessionName} -F "#{window_index}:#{window_name}" | grep ":${windowName}$"`
      );
      const match = stdout.trim().match(/^(\d+):/);
      if (match) {
        windowIndex = parseInt(match[1], 10);
      }
    } catch {
      // Use our calculated index as fallback
    }

    const tmuxWindow: TmuxWindow = {
      tabId,
      windowIndex,
      command,
      outputProcess: null,
      isEnded: false,
    };

    this.windows.set(tabId, tmuxWindow);

    // Start output capture
    this.startOutputCapture(tabId, windowIndex);

    // Send the command to execute
    if (command.length > 0) {
      const cmdString = command.join(' ');
      // Use tmux send-keys to execute the command
      await exec(`tmux send-keys -t ${this.sessionName}:${windowIndex} '${cmdString.replace(/'/g, "'\\''")}' Enter`);
    }

    console.log(`Created window ${windowIndex} for tab ${tabId} with command: ${command.join(' ')}`);
    return windowIndex;
  }

  /**
   * Start capturing output from a tmux window using pipe-pane
   */
  private startOutputCapture(tabId: string, windowIndex: number): void {
    const window = this.windows.get(tabId);
    if (!window) return;

    // Use tmux pipe-pane to capture output
    // We spawn a process that reads from a named pipe
    const pipePath = `/tmp/tmux-pipe-${this.sessionName}-${windowIndex}`;

    // First, set up the pipe
    const captureProcess = spawn('bash', ['-c', `
      rm -f ${pipePath}
      mkfifo ${pipePath}
      tmux pipe-pane -t ${this.sessionName}:${windowIndex} "cat > ${pipePath}"
      cat ${pipePath}
    `], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    window.outputProcess = captureProcess;

    captureProcess.stdout?.on('data', (data: Buffer) => {
      this.events.onOutput(tabId, data.toString());
    });

    captureProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`Capture stderr for ${tabId}:`, data.toString());
    });

    captureProcess.on('exit', (code) => {
      console.log(`Output capture for ${tabId} exited with code ${code}`);
      if (!window.isEnded) {
        window.isEnded = true;
        this.events.onExit(tabId, code || 0);
      }
    });

    captureProcess.on('error', (err) => {
      console.error(`Capture error for ${tabId}:`, err);
      this.events.onError(tabId, err);
    });
  }

  /**
   * Send input to a tab's tmux window
   */
  sendInput(tabId: string, data: string): boolean {
    const window = this.windows.get(tabId);
    if (!window || window.isEnded) {
      return false;
    }

    // Use tmux send-keys with -l for literal input
    // Handle special characters
    const escaped = data
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "'\\''");

    exec(`tmux send-keys -t ${this.sessionName}:${window.windowIndex} -l '${escaped}'`)
      .catch(err => console.error('Failed to send input:', err));

    return true;
  }

  /**
   * Resize a tab's terminal
   */
  resize(tabId: string, cols: number, rows: number): boolean {
    const window = this.windows.get(tabId);
    if (!window || window.isEnded) {
      return false;
    }

    // Resize the tmux window
    exec(`tmux resize-window -t ${this.sessionName}:${window.windowIndex} -x ${cols} -y ${rows}`)
      .catch(err => console.error('Failed to resize tmux window:', err));

    return true;
  }

  /**
   * Close a tab's window
   */
  async closeWindow(tabId: string): Promise<void> {
    const window = this.windows.get(tabId);
    if (!window) return;

    // Kill the output capture process
    if (window.outputProcess) {
      window.outputProcess.kill('SIGTERM');
    }

    // Kill the tmux window
    try {
      await exec(`tmux kill-window -t ${this.sessionName}:${window.windowIndex}`);
    } catch {
      // Window might already be closed
    }

    // Clean up pipe
    try {
      await exec(`rm -f /tmp/tmux-pipe-${this.sessionName}-${window.windowIndex}`);
    } catch {
      // Ignore
    }

    window.isEnded = true;
    this.windows.delete(tabId);
    console.log(`Closed window for tab ${tabId}`);
  }

  /**
   * Get status of all windows
   */
  getWindowStatus(): Array<{ tabId: string; windowIndex: number; isEnded: boolean }> {
    return [...this.windows.values()].map(w => ({
      tabId: w.tabId,
      windowIndex: w.windowIndex,
      isEnded: w.isEnded,
    }));
  }

  /**
   * Check if a tab has an active window
   */
  hasActiveWindow(tabId: string): boolean {
    const window = this.windows.get(tabId);
    return window !== undefined && !window.isEnded;
  }

  /**
   * Cleanup all windows and session
   */
  async cleanup(): Promise<void> {
    for (const [tabId] of this.windows) {
      await this.closeWindow(tabId);
    }

    // Optionally kill the entire session
    try {
      await exec(`tmux kill-session -t ${this.sessionName}`);
    } catch {
      // Session might not exist
    }

    this.initialized = false;
  }
}

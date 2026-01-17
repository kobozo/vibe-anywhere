/**
 * Tailscale Handler
 * Manages Tailscale connection status and operations
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TailscalePeer {
  id: string;
  hostname: string;
  tailscaleIP: string;
  online: boolean;
}

export interface TailscaleStatus {
  online: boolean;
  tailscaleIP: string | null;
  hostname: string | null;
  tailnet: string | null;
  peerCount: number;
  version: string | null;
  exitNode: string | null;
  peers: TailscalePeer[];
}

export class TailscaleHandler {
  private readonly COMMAND_TIMEOUT = 30000; // 30 seconds

  /**
   * Check if Tailscale is installed
   */
  async isInstalled(): Promise<boolean> {
    try {
      await execAsync('which tailscale', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get detailed Tailscale status
   * Returns null if Tailscale is not installed or not connected
   */
  async getStatus(): Promise<TailscaleStatus | null> {
    try {
      const { stdout } = await execAsync('tailscale status --json', {
        timeout: this.COMMAND_TIMEOUT,
      });

      const status = JSON.parse(stdout);

      // Self represents the current device
      const self = status.Self;
      if (!self) {
        console.log('[Tailscale] No Self object in status, returning null');
        return null;
      }

      // Parse peers (excluding self)
      const peersObj = status.Peer || {};
      const peerCount = Object.keys(peersObj).length;

      // Build peers array
      const peersList: TailscalePeer[] = [];
      let exitNode: string | null = null;

      for (const [nodeId, peer] of Object.entries(peersObj)) {
        const p = peer as any;

        // Check if this peer is an exit node
        if (p.ExitNode) {
          exitNode = p.HostName || p.DNSName || null;
        }

        // Add to peers list
        peersList.push({
          id: nodeId,
          hostname: p.HostName || p.DNSName || 'unknown',
          tailscaleIP: p.TailscaleIPs?.[0] || '',
          online: p.Online || false,
        });
      }

      return {
        online: self.Online || false,
        tailscaleIP: self.TailscaleIPs?.[0] || null,
        hostname: self.HostName || null,
        tailnet: self.TailnetName || null,
        peerCount,
        version: status.Version || null,
        exitNode,
        peers: peersList,
      };
    } catch (error) {
      // If command fails, Tailscale might not be installed or not running
      console.log('[Tailscale] getStatus() error:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Connect to Tailscale using an auth key
   */
  async connect(authKey: string): Promise<{ success: boolean; error?: string }> {
    // Validate auth key format
    if (!authKey || typeof authKey !== 'string') {
      return { success: false, error: 'Auth key is required' };
    }

    if (!authKey.startsWith('tskey-auth-')) {
      return {
        success: false,
        error: 'Invalid auth key format (must start with tskey-auth-)',
      };
    }

    try {
      // Run tailscale up with the auth key
      // --accept-routes allows accessing subnet routes advertised by peers
      // --authkey authenticates the device
      console.log('[Tailscale] Running: tailscale up --authkey=<redacted> --accept-routes');
      const { stdout, stderr } = await execAsync(
        `tailscale up --authkey=${authKey} --accept-routes`,
        {
          timeout: this.COMMAND_TIMEOUT,
        }
      );

      console.log('[Tailscale] stdout:', stdout);
      if (stderr) {
        console.log('[Tailscale] stderr:', stderr);
      }

      // Check if connection was successful
      const connected = await this.isConnected();
      if (!connected) {
        const errorMsg = stderr || stdout || 'Failed to connect to Tailscale';
        console.error('[Tailscale] Connection check failed:', errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      }

      console.log('[Tailscale] Successfully connected');
      return { success: true };
    } catch (error) {
      // Capture the actual error from exec
      const execError = error as any;
      const stderr = execError.stderr || '';
      const stdout = execError.stdout || '';
      const message = execError.message || String(error);

      console.error('[Tailscale] Connection failed:', {
        message,
        stdout,
        stderr,
      });

      // Return the actual Tailscale error message, not a generic one
      const actualError = stderr || stdout || message;

      // Provide helpful error messages based on actual error
      if (message.includes('timeout')) {
        return {
          success: false,
          error: `Connection timeout. Check network connectivity. Details: ${actualError}`,
        };
      }

      return {
        success: false,
        error: `Tailscale error: ${actualError}`,
      };
    }
  }

  /**
   * Disconnect from Tailscale
   */
  async disconnect(): Promise<{ success: boolean; error?: string }> {
    try {
      await execAsync('tailscale down', {
        timeout: this.COMMAND_TIMEOUT,
      });

      // Verify disconnection
      const stillConnected = await this.isConnected();
      if (stillConnected) {
        return {
          success: false,
          error: 'Failed to disconnect from Tailscale',
        };
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to disconnect: ${message}`,
      };
    }
  }

  /**
   * Check if Tailscale is currently connected
   * Lightweight check compared to getStatus()
   */
  async isConnected(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('tailscale status --json', {
        timeout: 5000,
      });

      const status = JSON.parse(stdout);
      return status.Self?.Online === true;
    } catch {
      return false;
    }
  }
}

/**
 * Tailscale Service
 * Manages Tailscale authentication and ephemeral auth key generation
 */

import { getSettingsService } from './settings-service';

export interface TailscaleAuthKey {
  key: string;
  expiresAt: Date;
}

export class TailscaleService {
  private oauthToken: string | null = null;
  private initialized: boolean = false;

  constructor() {
    // Fallback to env var for backward compatibility
    this.oauthToken = process.env.TAILSCALE_OAUTH_TOKEN || null;
  }

  /**
   * Load OAuth token from database
   * Should be called after construction to load from DB
   */
  async loadOAuthToken(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const settingsService = getSettingsService();
    const dbToken = await settingsService.getTailscaleOAuthToken();

    // Prioritize database token over env var
    if (dbToken) {
      this.oauthToken = dbToken;
    }

    this.initialized = true;
  }

  /**
   * Check if Tailscale is configured
   */
  isConfigured(): boolean {
    return Boolean(this.oauthToken);
  }

  /**
   * Generate an ephemeral auth key for a container
   * Auth keys expire after 1 hour and can only be used once
   *
   * @param tags - Optional tags to apply to the device (e.g., ["workspace:abc123"])
   * @returns Ephemeral auth key
   */
  async generateEphemeralAuthKey(tags?: string[]): Promise<TailscaleAuthKey> {
    if (!this.oauthToken) {
      throw new Error('TAILSCALE_OAUTH_TOKEN not configured. Add it to your .env file.');
    }

    const requestBody = {
      capabilities: {
        devices: {
          create: {
            reusable: false,
            ephemeral: true,
            preauthorized: true,
            tags: tags || [],
          },
        },
      },
      expirySeconds: 3600, // 1 hour
    };

    try {
      const response = await fetch('https://api.tailscale.com/api/v2/tailnet/-/keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.oauthToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TailscaleService] Tailscale API error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          requestBody,
        });
        throw new Error(`Tailscale API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as { key: string; expires: string };

      return {
        key: data.key,
        expiresAt: new Date(data.expires),
      };
    } catch (error) {
      console.error('Failed to generate Tailscale auth key:', error);
      throw new Error(
        `Failed to generate Tailscale auth key: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Test Tailscale OAuth token validity
   * Makes a simple API call to verify the token works
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.oauthToken) {
      return {
        success: false,
        error: 'TAILSCALE_OAUTH_TOKEN not configured',
      };
    }

    return this.testConnectionWithToken(this.oauthToken);
  }

  /**
   * Test a specific OAuth token without saving it
   * Used for validating tokens before storing them in the database
   */
  async testConnectionWithToken(token: string): Promise<{ success: boolean; error?: string }> {
    if (!token) {
      return {
        success: false,
        error: 'Token is required',
      };
    }

    try {
      // Try to list devices (read-only operation)
      const response = await fetch('https://api.tailscale.com/api/v2/tailnet/-/devices', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `API error (${response.status}): ${errorText}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Singleton instance
let tailscaleService: TailscaleService | null = null;

/**
 * Get the Tailscale service singleton
 * Note: Call loadOAuthToken() after getting the service to load token from database
 */
export function getTailscaleService(): TailscaleService {
  if (!tailscaleService) {
    tailscaleService = new TailscaleService();
  }
  return tailscaleService;
}

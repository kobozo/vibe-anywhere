/**
 * Tailscale Service
 * Manages Tailscale authentication and ephemeral auth key generation
 */

export interface TailscaleAuthKey {
  key: string;
  expiresAt: Date;
}

export class TailscaleService {
  private oauthToken: string | null = null;

  constructor() {
    this.oauthToken = process.env.TAILSCALE_OAUTH_TOKEN || null;
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

    try {
      // Try to list devices (read-only operation)
      const response = await fetch('https://api.tailscale.com/api/v2/tailnet/-/devices', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.oauthToken}`,
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
 */
export function getTailscaleService(): TailscaleService {
  if (!tailscaleService) {
    tailscaleService = new TailscaleService();
  }
  return tailscaleService;
}

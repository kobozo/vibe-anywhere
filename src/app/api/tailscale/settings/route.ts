/**
 * Tailscale Settings API
 * GET/POST/DELETE endpoints for managing Tailscale OAuth token
 */

import { NextRequest } from 'next/server';
import { SettingsService } from '@/lib/services';
import { requireAuth, successResponse, errorResponse, withErrorHandling } from '@/lib/api-utils';

/**
 * GET /api/tailscale/settings
 * Check if Tailscale OAuth token is configured (never returns the token itself)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const settingsService = new SettingsService();
  const isConfigured = await settingsService.isTailscaleConfigured();

  return successResponse({ isConfigured });
});

/**
 * POST /api/tailscale/settings
 * Save Tailscale OAuth token
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const body = await request.json();
  const { oauthToken } = body;

  // Validate OAuth token format
  if (!oauthToken || typeof oauthToken !== 'string') {
    return errorResponse('INVALID_OAUTH_TOKEN', 'OAuth token is required', 400);
  }

  if (!oauthToken.startsWith('tskey-')) {
    return errorResponse(
      'INVALID_OAUTH_TOKEN_FORMAT',
      'OAuth token must start with "tskey-"',
      400
    );
  }

  if (oauthToken.length < 30) {
    return errorResponse('INVALID_OAUTH_TOKEN_LENGTH', 'OAuth token appears to be too short', 400);
  }

  const settingsService = new SettingsService();
  await settingsService.saveTailscaleOAuthToken(oauthToken);

  return successResponse({ isConfigured: true });
});

/**
 * DELETE /api/tailscale/settings
 * Remove Tailscale OAuth token
 */
export const DELETE = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const settingsService = new SettingsService();
  await settingsService.clearTailscaleOAuthToken();

  return successResponse({ isConfigured: false });
});

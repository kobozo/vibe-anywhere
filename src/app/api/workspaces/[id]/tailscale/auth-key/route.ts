/**
 * Workspace Tailscale Auth Key API
 * POST endpoint to generate ephemeral auth key for workspace
 */

import { NextRequest } from 'next/server';
import { getTailscaleService } from '@/lib/services/tailscale-service';
import { requireAuth, successResponse, errorResponse, withErrorHandling } from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/workspaces/[id]/tailscale/auth-key
 * Generate an ephemeral auth key for connecting this workspace to Tailscale
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  await requireAuth(request);

  const { id: workspaceId } = await (context as RouteContext).params;

  try {
    const tailscaleService = getTailscaleService();

    // Load OAuth token from database
    await tailscaleService.loadOAuthToken();

    if (!tailscaleService.isConfigured()) {
      return errorResponse(
        'TAILSCALE_NOT_CONFIGURED',
        'Tailscale OAuth token not configured. Please add it in Settings.',
        400
      );
    }

    // Generate ephemeral auth key without tags
    // Tags require ACL configuration in Tailscale, so we omit them for simplicity
    const authKeyData = await tailscaleService.generateEphemeralAuthKey();

    return successResponse({
      authKey: authKeyData.key,
      expiresAt: authKeyData.expiresAt instanceof Date
        ? authKeyData.expiresAt.toISOString()
        : authKeyData.expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('AUTH_KEY_GENERATION_FAILED', `Failed to generate auth key: ${message}`, 500);
  }
});

/**
 * Tailscale Connection Test API
 * POST endpoint to test Tailscale OAuth token validity
 */

import { NextRequest } from 'next/server';
import { getTailscaleService } from '@/lib/services/tailscale-service';
import { requireAuth, successResponse, errorResponse, withErrorHandling } from '@/lib/api-utils';

interface TestConnectionRequest {
  oauthToken: string;
}

/**
 * POST /api/tailscale/connection/test
 * Test Tailscale OAuth token without saving it
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const body: TestConnectionRequest = await request.json();

  // Validate OAuth token
  if (!body.oauthToken || typeof body.oauthToken !== 'string') {
    return errorResponse('INVALID_OAUTH_TOKEN', 'OAuth token is required and must be a string', 400);
  }

  if (!body.oauthToken.startsWith('tskey-')) {
    return errorResponse(
      'INVALID_OAUTH_TOKEN_FORMAT',
      'OAuth token must start with "tskey-"',
      400
    );
  }

  try {
    const tailscaleService = getTailscaleService();
    const result = await tailscaleService.testConnectionWithToken(body.oauthToken);

    if (!result.success) {
      return errorResponse(
        'CONNECTION_FAILED',
        result.error || 'Failed to connect to Tailscale API',
        400
      );
    }

    return successResponse({
      success: true,
      message: 'Successfully connected to Tailscale API',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('CONNECTION_FAILED', `Failed to connect: ${message}`, 400);
  }
});

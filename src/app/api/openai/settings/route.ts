/**
 * OpenAI Settings API
 * GET/POST/DELETE endpoints for managing OpenAI API key
 */

import { NextRequest } from 'next/server';
import { getSettingsService } from '@/lib/services/settings-service';
import { requireAuth, successResponse, errorResponse, withErrorHandling } from '@/lib/api-utils';

/**
 * GET /api/openai/settings
 * Check if OpenAI API key is configured (never returns the key itself)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const settingsService = getSettingsService();
  const isConfigured = await settingsService.isWhisperConfigured();

  return successResponse({ isConfigured });
});

/**
 * POST /api/openai/settings
 * Save OpenAI API key
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const body = await request.json();
  const { apiKey } = body;

  // Validate API key format
  if (!apiKey || typeof apiKey !== 'string') {
    return errorResponse('INVALID_API_KEY', 'API key is required', 400);
  }

  if (!apiKey.startsWith('sk-')) {
    return errorResponse('INVALID_API_KEY_FORMAT', 'API key must start with "sk-"', 400);
  }

  if (apiKey.length < 20) {
    return errorResponse('INVALID_API_KEY_LENGTH', 'API key appears to be too short', 400);
  }

  const settingsService = getSettingsService();
  await settingsService.saveOpenAIApiKey(apiKey);

  return successResponse({ isConfigured: true });
});

/**
 * DELETE /api/openai/settings
 * Remove OpenAI API key
 */
export const DELETE = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const settingsService = getSettingsService();
  await settingsService.clearOpenAIApiKey();

  return successResponse({ isConfigured: false });
});

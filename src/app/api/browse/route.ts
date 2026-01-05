import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  withErrorHandling,
} from '@/lib/api-utils';

/**
 * GET /api/browse - List directories for the folder picker
 * @deprecated Local repository feature has been removed.
 * Repositories are now cloned directly in containers.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  return NextResponse.json(
    {
      error: 'Feature removed',
      message: 'Local folder browsing has been removed. Repositories are now cloned directly from remote URLs.',
    },
    { status: 410 } // 410 Gone
  );
});

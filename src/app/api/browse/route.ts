import { NextRequest } from 'next/server';
import { getRepositoryService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
} from '@/lib/api-utils';

/**
 * GET /api/browse - List directories for the folder picker
 * Query params:
 *   - path: Directory path to browse (defaults to home dir)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const url = new URL(request.url);
  const browsePath = url.searchParams.get('path') || undefined;

  const repoService = getRepositoryService();
  const entries = await repoService.listDirectories(browsePath);

  // Get parent path for navigation
  let parentPath = null;
  if (browsePath && browsePath !== '/') {
    const parts = browsePath.split('/');
    parts.pop();
    parentPath = parts.join('/') || '/';
  }

  return successResponse({
    currentPath: browsePath || process.env.HOME || '/',
    parentPath,
    entries,
  });
});

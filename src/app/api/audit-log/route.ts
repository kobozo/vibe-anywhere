import { NextRequest } from 'next/server';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ApiRequestError,
} from '@/lib/api-utils';
import { canManageUsers } from '@/lib/permissions';
import { getAuditLogService } from '@/lib/services';
import { type UserAuditAction } from '@/lib/db';

/**
 * GET /api/audit-log - Get user management audit logs
 * - Requires admin or user-admin role
 * - Optional query parameters:
 *   - type: Filter by action type (user_management returns user-related actions)
 *   - action: Filter by specific action (user_created, role_changed, etc.)
 *   - limit: Number of entries to return (default: 100)
 * - Returns audit logs sorted by timestamp (newest first)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);

  // Check if user has permission to view audit logs
  if (!canManageUsers(user)) {
    throw new ApiRequestError(
      "You don't have permission to view audit logs",
      'FORBIDDEN',
      403
    );
  }

  // Parse query parameters
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const action = searchParams.get('action');
  const limitParam = searchParams.get('limit');

  // Build filters
  const limit = limitParam ? parseInt(limitParam, 10) : 100;
  const filters: {
    action?: UserAuditAction;
    limit: number;
  } = { limit };

  // If action is specified, use it
  if (action) {
    filters.action = action as UserAuditAction;
  }

  // Fetch audit logs
  const auditLogService = getAuditLogService();
  const logs = await auditLogService.getUserAuditLogs(filters);

  return successResponse({ logs });
});

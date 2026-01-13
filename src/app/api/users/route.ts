import { NextRequest } from 'next/server';
import { desc } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ApiRequestError,
} from '@/lib/api-utils';
import { canManageUsers } from '@/lib/permissions';

/**
 * GET /api/users - List all users
 * - Requires admin or user-admin role
 * - Returns all users without password hashes or tokens
 * - Sorted by createdAt (newest first)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);

  // Check if user has permission to manage users
  if (!canManageUsers(user)) {
    throw new ApiRequestError(
      "You don't have permission to view users",
      'FORBIDDEN',
      403
    );
  }

  // Fetch all users from database
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      forcePasswordChange: users.forcePasswordChange,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return successResponse({ users: allUsers });
});

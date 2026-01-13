import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, users, type UserRole } from '@/lib/db';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ValidationError,
  NotFoundError,
  ApiRequestError,
} from '@/lib/api-utils';
import { isAdmin } from '@/lib/permissions';

// Valid role values based on schema
const VALID_ROLES: UserRole[] = ['admin', 'user-admin', 'developer', 'template-admin', 'security-admin'];

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'user-admin', 'developer', 'template-admin', 'security-admin']),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/users/[id]/role - Update a user's role
 * - Requires admin role
 * - Cannot change own role (prevent accidental self-demotion)
 * - Validates new role is valid enum value
 * - Returns updated user object (without password hash)
 */
export const PATCH = withErrorHandling(
  async (request: NextRequest, context: unknown) => {
    const user = await requireAuth(request);
    const { id } = await (context as RouteContext).params;

    // Check if requesting user is admin
    if (!isAdmin(user)) {
      throw new ApiRequestError(
        "You don't have permission to perform this action",
        'FORBIDDEN',
        403
      );
    }

    // Prevent changing own role
    if (user.id === id) {
      throw new ApiRequestError(
        'Cannot change your own role',
        'FORBIDDEN',
        403
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const result = updateRoleSchema.safeParse(body);

    if (!result.success) {
      throw new ValidationError('Invalid role value', result.error.flatten());
    }

    const { role: newRole } = result.data;

    // Check if target user exists
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!targetUser) {
      throw new NotFoundError('User', id);
    }

    // Update user role
    const [updatedUser] = await db
      .update(users)
      .set({
        role: newRole,
        updatedAt: Date.now()
      })
      .where(eq(users.id, id))
      .returning();

    // Return user without password hash
    const { passwordHash, ...userWithoutPassword } = updatedUser;

    return successResponse({ user: userWithoutPassword });
  }
);

import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ApiRequestError,
  ValidationError,
  NotFoundError,
} from '@/lib/api-utils';
import { canManageUsers } from '@/lib/permissions';
import { getAuthService, getAuditLogService } from '@/lib/services';
import { userRoleEnum } from '@/lib/db/schema';

// Get valid roles from the enum
const validRoles = userRoleEnum.enumValues;

const changeRoleSchema = z.object({
  role: z.enum(validRoles as [string, ...string[]]),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/users/[id]/role - Change user role
 * - Requires admin or user-admin role
 * - Cannot change own role
 * - Accepts { role } - new role value
 * - Logs action to audit log with role details
 * - Returns updated user (without passwordHash/token)
 */
export const PATCH = withErrorHandling(
  async (request: NextRequest, context: unknown) => {
    const user = await requireAuth(request);
    const { id } = await (context as RouteContext).params;

    // Check if user has permission to manage users
    if (!canManageUsers(user)) {
      throw new ApiRequestError(
        "You don't have permission to change user roles",
        'FORBIDDEN',
        403
      );
    }

    // Prevent self-modification
    if (user.id === id) {
      throw new ApiRequestError(
        'Cannot change your own role',
        'FORBIDDEN',
        403
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const result = changeRoleSchema.safeParse(body);

    if (!result.success) {
      throw new ValidationError('Invalid role', result.error.flatten());
    }

    const { role } = result.data;

    // Get the user first to log the change
    const authService = getAuthService();
    const targetUser = await authService.getUserById(id);

    if (!targetUser) {
      throw new NotFoundError('User', id);
    }

    const oldRole = targetUser.role;

    // Change role using authService
    try {
      const updatedUser = await authService.updateUserRole(id, role);

      // Log to audit
      const auditLogService = getAuditLogService();
      const details = `Role changed from ${oldRole} to ${role}`;

      await auditLogService.logUserAction(
        'role_changed',
        user.id,
        { id: updatedUser.id, username: updatedUser.username },
        details,
        request
      );

      return successResponse({
        message: 'Role changed successfully',
        user: updatedUser,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'User not found') {
        throw new NotFoundError('User', id);
      }
      throw error;
    }
  }
);

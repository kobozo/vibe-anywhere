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

const updateUsernameSchema = z.object({
  username: z.string().min(1, 'Username is required'),
});

const deleteUserSchema = z.object({
  action: z.enum(['deactivate', 'delete']),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/users/[id] - Update username
 * - Requires admin or user-admin role
 * - Accepts { username }
 * - Logs action to audit log
 * - Returns updated user
 */
export const PATCH = withErrorHandling(
  async (request: NextRequest, context: unknown) => {
    const user = await requireAuth(request);
    const { id } = await (context as RouteContext).params;

    // Check if user has permission to manage users
    if (!canManageUsers(user)) {
      throw new ApiRequestError(
        "You don't have permission to update users",
        'FORBIDDEN',
        403
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const result = updateUsernameSchema.safeParse(body);

    if (!result.success) {
      throw new ValidationError('Invalid username', result.error.flatten());
    }

    const { username: newUsername } = result.data;

    // Update username using authService
    const authService = getAuthService();
    try {
      const updatedUser = await authService.updateUsername(id, newUsername);

      // Log to audit
      const auditLogService = getAuditLogService();
      await auditLogService.logUserAction(
        'user_edited',
        user.id,
        { id: updatedUser.id, username: updatedUser.username },
        `Updated username to: ${newUsername}`,
        request
      );

      return successResponse({ user: updatedUser });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Username already exists') {
          throw new ApiRequestError('Username already exists', 'DUPLICATE_USERNAME', 409);
        }
        if (error.message === 'User not found') {
          throw new NotFoundError('User', id);
        }
      }
      throw error;
    }
  }
);

/**
 * DELETE /api/users/[id] - Delete or deactivate user
 * - Requires admin or user-admin role
 * - Accepts { action: 'deactivate' | 'delete' }
 * - Cannot delete/deactivate self
 * - Logs action to audit log
 * - Returns success message
 */
export const DELETE = withErrorHandling(
  async (request: NextRequest, context: unknown) => {
    const user = await requireAuth(request);
    const { id } = await (context as RouteContext).params;

    // Check if user has permission to manage users
    if (!canManageUsers(user)) {
      throw new ApiRequestError(
        "You don't have permission to delete users",
        'FORBIDDEN',
        403
      );
    }

    // Prevent self-modification
    if (user.id === id) {
      throw new ApiRequestError(
        'Cannot delete or deactivate your own account',
        'FORBIDDEN',
        403
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const result = deleteUserSchema.safeParse(body);

    if (!result.success) {
      throw new ValidationError('Invalid action', result.error.flatten());
    }

    const { action } = result.data;

    const authService = getAuthService();
    const auditLogService = getAuditLogService();

    try {
      if (action === 'deactivate') {
        // Deactivate user (soft delete)
        const deactivatedUser = await authService.deactivateUser(id, user.id);

        // Log to audit
        await auditLogService.logUserAction(
          'user_deactivated',
          user.id,
          { id: deactivatedUser.id, username: deactivatedUser.username },
          'User account deactivated',
          request
        );

        return successResponse({
          message: 'User deactivated successfully',
          user: deactivatedUser
        });
      } else {
        // Get user info before deletion for audit log
        const targetUser = await authService.getUserById(id);
        if (!targetUser) {
          throw new NotFoundError('User', id);
        }

        // Hard delete user
        await authService.deleteUser(id);

        // Log to audit
        await auditLogService.logUserAction(
          'user_deleted',
          user.id,
          { id: targetUser.id, username: targetUser.username },
          'User account permanently deleted',
          request
        );

        return successResponse({ message: 'User deleted successfully' });
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'User not found') {
          throw new NotFoundError('User', id);
        }
        if (error.message.includes('Cannot delete user')) {
          throw new ApiRequestError(error.message, 'HAS_RESOURCES', 409);
        }
      }
      throw error;
    }
  }
);

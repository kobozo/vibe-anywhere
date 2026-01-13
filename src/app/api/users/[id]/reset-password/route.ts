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

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/users/[id]/reset-password - Reset user password
 * - Requires admin or user-admin role
 * - Cannot reset own password (use change password endpoint)
 * - Accepts { newPassword? } - optional new password
 * - If newPassword provided, sets it and forces password change
 * - If not provided, only sets forcePasswordChange flag
 * - Logs action to audit log
 * - Returns success message
 */
export const POST = withErrorHandling(
  async (request: NextRequest, context: unknown) => {
    const user = await requireAuth(request);
    const { id } = await (context as RouteContext).params;

    // Check if user has permission to manage users
    if (!canManageUsers(user)) {
      throw new ApiRequestError(
        "You don't have permission to reset user passwords",
        'FORBIDDEN',
        403
      );
    }

    // Prevent self-modification
    if (user.id === id) {
      throw new ApiRequestError(
        'Cannot reset your own password. Use the change password feature instead',
        'FORBIDDEN',
        403
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const result = resetPasswordSchema.safeParse(body);

    if (!result.success) {
      throw new ValidationError('Invalid password', result.error.flatten());
    }

    const { newPassword } = result.data;

    // Reset password using authService
    const authService = getAuthService();
    try {
      const updatedUser = await authService.resetUserPassword(id, newPassword);

      // Log to audit
      const auditLogService = getAuditLogService();
      const details = newPassword
        ? 'Password reset with new password provided'
        : 'Password reset - user must set new password on next login';

      await auditLogService.logUserAction(
        'password_reset',
        user.id,
        { id: updatedUser.id, username: updatedUser.username },
        details,
        request
      );

      return successResponse({
        message: 'Password reset successfully',
        user: updatedUser
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'User not found') {
        throw new NotFoundError('User', id);
      }
      throw error;
    }
  }
);

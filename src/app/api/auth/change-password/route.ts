import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  errorResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/api-utils';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/**
 * POST /api/auth/change-password - Change user password
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const body = await request.json();

  const result = changePasswordSchema.safeParse(body);

  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const { currentPassword, newPassword } = result.data;
  const authService = getAuthService();

  try {
    await authService.changePassword(user.id, currentPassword, newPassword);
    return successResponse({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Current password is incorrect') {
      return errorResponse('INVALID_PASSWORD', 'Current password is incorrect', 401);
    }
    throw error;
  }
});

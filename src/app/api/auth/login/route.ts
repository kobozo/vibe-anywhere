import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthService } from '@/lib/services';
import { successResponse, errorResponse, withErrorHandling, ValidationError } from '@/lib/api-utils';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const result = loginSchema.safeParse(body);

  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const { username, password } = result.data;
  const authService = getAuthService();

  try {
    const authResult = await authService.login(username, password);
    return successResponse(authResult);
  } catch (error) {
    return errorResponse('INVALID_CREDENTIALS', 'Invalid username or password', 401);
  }
});

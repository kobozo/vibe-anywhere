import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ApiRequestError,
  ValidationError,
} from '@/lib/api-utils';
import { canManageUsers } from '@/lib/permissions';
import { getAuthService, getAuditLogService } from '@/lib/services';

const createUserSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'user-admin', 'developer', 'template-admin', 'security-admin']),
});

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

  // Fetch all users using authService
  const authService = getAuthService();
  const allUsers = await authService.listAllUsers();

  return successResponse({ users: allUsers });
});

/**
 * POST /api/users - Create a new user
 * - Requires admin or user-admin role
 * - Accepts { username, password, role }
 * - Logs action to audit log
 * - Returns created user (without password hash or token)
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);

  // Check if user has permission to manage users
  if (!canManageUsers(user)) {
    throw new ApiRequestError(
      "You don't have permission to create users",
      'FORBIDDEN',
      403
    );
  }

  // Parse and validate request body
  const body = await request.json();
  const result = createUserSchema.safeParse(body);

  if (!result.success) {
    throw new ValidationError('Invalid user data', result.error.flatten());
  }

  const { username, password, role } = result.data;

  // Create user using authService
  const authService = getAuthService();
  try {
    const { user: newUser } = await authService.createUser(username, password, role);

    // Log to audit
    const auditLogService = getAuditLogService();
    await auditLogService.logUserAction(
      'user_created',
      user.id,
      { id: newUser.id, username: newUser.username },
      `Created user with role: ${role}`,
      request
    );

    return successResponse({ user: newUser }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Username already exists') {
      throw new ApiRequestError('Username already exists', 'DUPLICATE_USERNAME', 409);
    }
    throw error;
  }
});

import { NextRequest, NextResponse } from 'next/server';
import { getAuthService } from '@/lib/services';
import type { User } from '@/lib/db';
import type { ApiError as ApiErrorType } from '@/types/api';

/**
 * Extract and validate auth token from request
 */
export async function getAuthUser(request: NextRequest): Promise<User | null> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;

  const authService = getAuthService();
  return authService.validateToken(token);
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(request: NextRequest): Promise<User> {
  const user = await getAuthUser(request);
  if (!user) {
    throw new AuthError('Authentication required', 'UNAUTHORIZED');
  }
  return user;
}

/**
 * Create a JSON error response
 */
export function errorResponse(code: string, message: string, status = 400, details?: unknown): NextResponse {
  const error: ApiErrorType = { code, message };
  if (details) {
    error.details = details;
  }
  return NextResponse.json({ error }, { status });
}

/**
 * Safely serialize date fields in objects
 * Converts Date objects to ISO strings, leaves strings as-is
 */
function serializeDates<T>(value: T): T {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle Date objects
  if (value instanceof Date) {
    return value.toISOString() as T;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(item => serializeDates(item)) as T;
  }

  // Handle objects (but not special types like RegExp, Error, etc.)
  if (typeof value === 'object' && value.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = serializeDates(val);
    }
    return result as T;
  }

  // Return primitives and other types as-is
  return value;
}

/**
 * Create a JSON success response with proper date serialization
 */
export function successResponse<T>(data: T, status = 200): NextResponse {
  // Serialize any Date objects to ISO strings to prevent serialization errors
  const serializedData = serializeDates(data);
  return NextResponse.json({ data: serializedData }, { status });
}

/**
 * Custom error class for API errors
 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  toResponse(): NextResponse {
    return errorResponse(this.code, this.message, this.status, this.details);
  }
}

// Alias for backwards compatibility with code that uses (status, message) signature
export class ApiError extends ApiRequestError {
  constructor(status: number, message: string, details?: unknown) {
    super(message, 'API_ERROR', status, details);
    this.name = 'ApiError';
  }
}

export class AuthError extends ApiRequestError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(message, code, 401);
    this.name = 'AuthError';
  }
}

export class NotFoundError extends ApiRequestError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} '${id}' not found` : `${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ApiRequestError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Wrap API handler with error handling
 */
export function withErrorHandling(
  handler: (request: NextRequest, context?: unknown) => Promise<NextResponse>
): (request: NextRequest, context?: unknown) => Promise<NextResponse> {
  return async (request: NextRequest, context?: unknown) => {
    try {
      return await handler(request, context);
    } catch (error) {
      console.error('API Error:', error);
      if (error instanceof Error && error.stack) {
        console.error('Stack trace:', error.stack);
      }

      if (error instanceof ApiRequestError) {
        return error.toResponse();
      }

      if (error instanceof Error) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
      }

      return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
    }
  };
}

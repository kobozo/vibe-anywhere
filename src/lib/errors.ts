/**
 * Common error classes for API and service layers
 * Note: This file must NOT import from Next.js to avoid tsx transformation issues
 */

export class NotFoundError extends Error {
  constructor(
    public resource: string,
    public id: string
  ) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code: 'UNAUTHORIZED' | 'FORBIDDEN' = 'UNAUTHORIZED'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

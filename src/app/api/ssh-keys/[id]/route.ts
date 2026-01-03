import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getSSHKeyService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
  ValidationError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateKeySchema = z.object({
  isDefault: z.boolean().optional(),
});

/**
 * GET /api/ssh-keys/[id] - Get a key by ID (includes public key)
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const sshKeyService = getSSHKeyService();
  const key = await sshKeyService.getKey(id);

  if (!key || key.userId !== user.id) {
    throw new NotFoundError('SSH Key', id);
  }

  return successResponse({ key: sshKeyService.toKeyInfo(key) });
});

/**
 * PATCH /api/ssh-keys/[id] - Update a key (e.g., set as default)
 */
export const PATCH = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = updateKeySchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const sshKeyService = getSSHKeyService();
  const key = await sshKeyService.getKey(id);

  if (!key || key.userId !== user.id) {
    throw new NotFoundError('SSH Key', id);
  }

  if (result.data.isDefault !== undefined && result.data.isDefault) {
    await sshKeyService.setDefaultKey(user.id, id);
  }

  const updatedKey = await sshKeyService.getKey(id);
  return successResponse({ key: sshKeyService.toKeyInfo(updatedKey!) });
});

/**
 * DELETE /api/ssh-keys/[id] - Delete a key
 */
export const DELETE = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const sshKeyService = getSSHKeyService();
  const key = await sshKeyService.getKey(id);

  if (!key || key.userId !== user.id) {
    throw new NotFoundError('SSH Key', id);
  }

  await sshKeyService.deleteKey(id);

  return successResponse({ success: true });
});

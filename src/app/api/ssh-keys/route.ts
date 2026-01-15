import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as crypto from 'crypto';
import { getSSHKeyService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/api-utils';

const generateKeySchema = z.object({
  action: z.literal('generate'),
  name: z.string().min(1, 'Name is required').max(100),
  keyType: z.enum(['ed25519', 'rsa', 'ecdsa']).optional(),
  comment: z.string().max(200).optional(),
});

const addKeySchema = z.object({
  action: z.literal('add'),
  name: z.string().min(1, 'Name is required').max(100),
  publicKey: z.string().min(1, 'Public key is required'),
  privateKey: z.string().min(1, 'Private key is required'),
  keyType: z.enum(['ed25519', 'rsa', 'ecdsa']).optional(),
});

const createKeySchema = z.discriminatedUnion('action', [
  generateKeySchema,
  addKeySchema,
]);

/**
 * GET /api/ssh-keys - List all SSH keys for the authenticated user
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const sshKeyService = getSSHKeyService();

  const keys = await sshKeyService.listUserKeys(user.id);
  const keyInfos = keys.map((k) => sshKeyService.toKeyInfo(k));

  return successResponse({ keys: keyInfos });
});

/**
 * POST /api/ssh-keys - Create or generate a new SSH key
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const body = await request.json();

  const result = createKeySchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const sshKeyService = getSSHKeyService();
  let key;

  if (result.data.action === 'generate') {
    key = await sshKeyService.generateUserKey(user.id, {
      name: result.data.name,
      keyType: result.data.keyType,
      comment: result.data.comment,
    });
  } else {
    key = await sshKeyService.addUserKey(user.id, {
      name: result.data.name,
      publicKey: result.data.publicKey,
      privateKey: result.data.privateKey,
      keyType: result.data.keyType,
    });
  }

  return successResponse({ key: sshKeyService.toKeyInfo(key) }, 201);
});

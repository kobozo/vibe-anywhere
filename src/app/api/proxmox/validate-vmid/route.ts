/**
 * Proxmox VMID Validation API
 *
 * POST /api/proxmox/validate-vmid - Check if a VMID is available
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { config } from '@/lib/config';
import { getProxmoxClientAsync } from '@/lib/container/proxmox/client';
import { requireAuth, withErrorHandling, ValidationError } from '@/lib/api-utils';

const validateVmidSchema = z.object({
  vmid: z.number().int().min(100, 'VMID must be >= 100').max(999999999),
});

/**
 * POST /api/proxmox/validate-vmid
 * Check if a VMID is available in Proxmox
 *
 * Body: { vmid: number }
 * Returns: { available: boolean, message?: string }
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  // Check if Proxmox is configured
  if (config.container.backend !== 'proxmox') {
    return NextResponse.json(
      { error: 'Proxmox backend not configured' },
      { status: 400 }
    );
  }

  const body = await request.json();
  const result = validateVmidSchema.safeParse(body);

  if (!result.success) {
    throw new ValidationError('Invalid VMID', result.error.flatten());
  }

  const { vmid } = result.data;

  try {
    const client = await getProxmoxClientAsync();

    // Try to get the LXC status - if it succeeds, the VMID exists
    try {
      await client.getLxcStatus(vmid);
      // VMID exists (container found)
      return NextResponse.json({
        available: false,
        message: `VMID ${vmid} is already in use`,
      });
    } catch (error) {
      // Proxmox returns specific error for non-existent VMIDs
      // Check if error message indicates "does not exist" or similar
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isNotFound =
        errorMessage.includes('does not exist') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('no such') ||
        errorMessage.includes('Configuration file') && errorMessage.includes('does not exist');

      if (isNotFound) {
        // VMID doesn't exist, it's available
        return NextResponse.json({
          available: true,
          message: `VMID ${vmid} is available`,
        });
      }

      // Other errors (network issues, permission problems, etc.)
      // Don't assume the VMID is available - report the error
      console.error('Error checking VMID status:', error);
      return NextResponse.json({
        available: false,
        error: 'Could not verify VMID availability. Please try again.',
        message: 'Unable to check Proxmox - please verify VMID manually',
      });
    }
  } catch (error) {
    console.error('Error validating VMID:', error);
    return NextResponse.json(
      { error: 'Failed to check VMID availability' },
      { status: 500 }
    );
  }
});

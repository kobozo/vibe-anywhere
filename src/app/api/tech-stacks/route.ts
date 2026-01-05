/**
 * Tech Stacks API
 * GET endpoint for listing available tech stacks
 */

import { NextRequest } from 'next/server';
import { TECH_STACKS } from '@/lib/container/proxmox/tech-stacks';
import { requireAuth, successResponse, withErrorHandling } from '@/lib/api-utils';

/**
 * Public tech stack info (without install scripts)
 */
interface TechStackInfo {
  id: string;
  name: string;
  description: string;
  requiresNesting?: boolean;
}

/**
 * GET /api/tech-stacks
 * Get list of available tech stacks
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  // Return public info about tech stacks (without install scripts)
  const stacks: TechStackInfo[] = TECH_STACKS.map(stack => ({
    id: stack.id,
    name: stack.name,
    description: stack.description,
    requiresNesting: stack.requiresNesting,
  }));

  return successResponse({
    stacks,
  });
});

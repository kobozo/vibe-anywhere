import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workspaces } from '@/lib/db/schema';
import { getRepositoryService, getWorkspaceService, getTemplateService } from '@/lib/services';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  NotFoundError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/workspaces/[id]/template - Get template info for a workspace
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const workspaceService = await getWorkspaceService();
  const workspace = await workspaceService.getWorkspace(id);

  if (!workspace) {
    throw new NotFoundError('Workspace', id);
  }

  // Verify ownership through repository
  const repoService = getRepositoryService();
  const repository = await repoService.getRepository(workspace.repositoryId);

  if (!repository || repository.userId !== user.id) {
    throw new NotFoundError('Workspace', id);
  }

  const templateService = getTemplateService();
  let template;

  // Check if workspace has a templateId (new workspaces)
  if (workspace.templateId) {
    template = await templateService.getTemplate(workspace.templateId);
  } else {
    // Migration: get template from repository and save to workspace
    template = await templateService.getTemplateForRepository(repository.id);
    if (template) {
      // Save template to workspace for future lookups
      await db
        .update(workspaces)
        .set({ templateId: template.id })
        .where(eq(workspaces.id, id));
    }
  }

  if (!template) {
    return successResponse({
      template: null,
    });
  }

  return successResponse({
    template: {
      name: template.name,
      vmid: template.vmid,
      status: template.status,
      techStacks: template.techStacks || [],
      inheritedTechStacks: template.inheritedTechStacks || [],
    },
  });
});

import { NextRequest } from 'next/server';
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

  // Get template for this repository
  const templateService = getTemplateService();
  const template = await templateService.getTemplateForRepository(repository.id);

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

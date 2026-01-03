import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositoryService, getWorkspaceService, getTabService } from '@/lib/services';
import { getTabTemplateService } from '@/lib/services/tab-template-service';
import {
  requireAuth,
  successResponse,
  withErrorHandling,
  ValidationError,
  NotFoundError,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const createTabSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  templateId: z.string().uuid().optional(),
  args: z.array(z.string()).optional(),
  command: z.array(z.string()).optional(),
  autoShutdownMinutes: z.number().int().positive().optional(),
});

/**
 * GET /api/workspaces/[id]/tabs - List tabs for a workspace
 */
export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;

  const workspaceService = getWorkspaceService();
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

  const tabService = getTabService();
  const tabs = await tabService.listTabs(id);
  const tabInfos = tabs.map((t) => tabService.toTabInfo(t));

  return successResponse({ tabs: tabInfos });
});

/**
 * POST /api/workspaces/[id]/tabs - Create a new tab
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;
  const body = await request.json();

  const result = createTabSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }

  const workspaceService = getWorkspaceService();
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

  // Build the command from template if templateId provided
  let command: string[] | undefined = result.data.command;

  if (result.data.templateId) {
    const templateService = getTabTemplateService();
    const template = await templateService.getTemplate(result.data.templateId);

    if (!template) {
      throw new NotFoundError('Tab template', result.data.templateId);
    }

    // Build command: [command, ...templateArgs, ...userArgs]
    command = [template.command, ...(template.args || []), ...(result.data.args || [])];
  }

  const tabService = getTabService();
  const tab = await tabService.createTab(id, {
    name: result.data.name,
    command,
    autoShutdownMinutes: result.data.autoShutdownMinutes,
  });

  return successResponse({ tab: tabService.toTabInfo(tab) }, 201);
});

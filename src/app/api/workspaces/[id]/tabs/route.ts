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
import type { TabType } from '@/lib/db/schema';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const createTabSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  templateId: z.string().uuid().optional(),
  tabType: z.enum(['dashboard', 'git', 'docker']).optional(), // For static tabs
  args: z.array(z.string()).optional(),
  command: z.array(z.string()).optional(),
  exitOnClose: z.boolean().optional(),
  icon: z.string().optional(),
  autoShutdownMinutes: z.number().int().positive().optional(),
});

/**
 * GET /api/workspaces/[id]/tabs - List tabs for a workspace
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

  const tabService = getTabService();

  // Static tabs (dashboard, git, docker) are now created on-demand via CreateTabDialog
  // No longer auto-created here

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

  const tabService = getTabService();

  // Handle static tabs (dashboard, git, docker)
  if (result.data.tabType) {
    const staticTabType = result.data.tabType as TabType;

    // Static tabs don't run commands, they render special panels
    const tab = await tabService.createTab(id, {
      name: result.data.name,
      command: [], // Static tabs don't run commands
      tabType: staticTabType,
      icon: staticTabType, // Use tab type as icon identifier
      isPinned: false, // No longer forced pinned
      sortOrder: staticTabType === 'dashboard' ? -101 : staticTabType === 'git' ? -100 : -99,
    });

    return successResponse({ tab: tabService.toTabInfo(tab) }, 201);
  }

  // Build the command from template if templateId provided
  let command: string[] | undefined = result.data.command;
  let exitOnClose: boolean | undefined = result.data.exitOnClose;
  let icon: string | undefined = result.data.icon;

  if (result.data.templateId) {
    const templateService = getTabTemplateService();
    const template = await templateService.getTemplate(result.data.templateId);

    if (!template) {
      throw new NotFoundError('Tab template', result.data.templateId);
    }

    // Build command: [command, ...templateArgs, ...userArgs]
    command = [template.command, ...(template.args || []), ...(result.data.args || [])];

    // Use template's exitOnClose if not explicitly provided
    if (exitOnClose === undefined) {
      exitOnClose = template.exitOnClose;
    }

    // Get icon from template
    icon = template.icon || undefined;
  }

  const tab = await tabService.createTab(id, {
    name: result.data.name,
    command,
    exitOnClose,
    icon,
    autoShutdownMinutes: result.data.autoShutdownMinutes,
  });

  return successResponse({ tab: tabService.toTabInfo(tab) }, 201);
});

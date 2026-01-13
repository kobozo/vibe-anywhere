import { NextRequest } from 'next/server';
import { getWorkspaceService, getRepositoryService } from '@/lib/services';
import { getEnvVarService } from '@/lib/services/env-var-service';
import { execSSHCommand } from '@/lib/container/proxmox/ssh-stream';
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
 * GET /api/workspaces/[id]/env-file - Read .env file from workspace
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

  // Check if container is running
  if (workspace.containerStatus !== 'running' || !workspace.containerIp) {
    return successResponse({
      error: 'Container is not running',
      envVars: null,
    }, 200);
  }

  try {
    // Read .env file from workspace
    const result = await execSSHCommand(
      { host: workspace.containerIp, username: 'root' },
      ['cat', '/workspace/.env'],
      { workingDir: '/workspace' }
    );

    if (result.exitCode !== 0) {
      // File doesn't exist or can't be read
      return successResponse({
        exists: false,
        envVars: {},
      });
    }

    // Parse .env file content
    const envVars: Record<string, string> = {};
    const lines = result.stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        envVars[key] = value;
      }
    }

    return successResponse({
      exists: true,
      envVars,
    });
  } catch (error) {
    console.error('Failed to read .env file:', error);
    return successResponse({
      error: 'Failed to read .env file',
      envVars: null,
    }, 200);
  }
});

/**
 * POST /api/workspaces/[id]/env-file - Write repository env vars to .env file
 */
export const POST = withErrorHandling(async (request: NextRequest, context: unknown) => {
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

  // Check if container is running
  if (workspace.containerStatus !== 'running' || !workspace.containerIp) {
    return successResponse({
      success: false,
      error: 'Container is not running',
    }, 400);
  }

  try {
    // Get merged env vars (template + repository)
    const envVarService = getEnvVarService();
    const mergedEnvVars = await envVarService.getMergedEnvVars(
      workspace.repositoryId,
      workspace.templateId ?? undefined
    );

    // Add CHROME_PATH environment variable to point to CDP proxy shim
    mergedEnvVars.CHROME_PATH = '/usr/local/bin/chromium';

    if (Object.keys(mergedEnvVars).length === 0) {
      return successResponse({
        success: false,
        error: 'No environment variables configured',
      }, 400);
    }

    // Build .env file content
    const envContent = Object.entries(mergedEnvVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n';

    // Write .env file to workspace
    await execSSHCommand(
      { host: workspace.containerIp, username: 'root' },
      ['bash', '-c', `cat > /workspace/.env << 'ENVEOF'
${envContent}ENVEOF
chmod 644 /workspace/.env
chown kobozo:kobozo /workspace/.env`],
      { workingDir: '/workspace' }
    );

    return successResponse({
      success: true,
      count: Object.keys(mergedEnvVars).length,
    });
  } catch (error) {
    console.error('Failed to write .env file:', error);
    return successResponse({
      success: false,
      error: 'Failed to write .env file',
    }, 500);
  }
});

/**
 * PUT /api/workspaces/[id]/env-file - Sync .env file back to repository env vars
 */
export const PUT = withErrorHandling(async (request: NextRequest, context: unknown) => {
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

  // Check if container is running
  if (workspace.containerStatus !== 'running' || !workspace.containerIp) {
    return successResponse({
      success: false,
      error: 'Container is not running',
    }, 400);
  }

  try {
    // Read .env file from workspace
    const result = await execSSHCommand(
      { host: workspace.containerIp, username: 'root' },
      ['cat', '/workspace/.env'],
      { workingDir: '/workspace' }
    );

    if (result.exitCode !== 0) {
      return successResponse({
        success: false,
        error: '.env file does not exist',
      }, 400);
    }

    // Parse .env file content
    const envVars: { key: string; value: string; encrypted: boolean }[] = [];
    const lines = result.stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // Check if the key looks like a secret (contains SECRET, KEY, TOKEN, PASSWORD, etc.)
        const isSecret = /SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL|API_KEY/i.test(key);
        envVars.push({ key, value, encrypted: isSecret });
      }
    }

    if (envVars.length === 0) {
      return successResponse({
        success: false,
        error: 'No valid environment variables found in .env file',
      }, 400);
    }

    // Update repository env vars
    const envVarService = getEnvVarService();
    await envVarService.updateRepositoryEnvVars(workspace.repositoryId, envVars);

    return successResponse({
      success: true,
      count: envVars.length,
    });
  } catch (error) {
    console.error('Failed to sync .env file:', error);
    return successResponse({
      success: false,
      error: 'Failed to sync .env file',
    }, 500);
  }
});

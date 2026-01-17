import { NextRequest, NextResponse } from 'next/server';
import { getAuthService, getWorkspaceService } from '@/lib/services';

/**
 * POST /api/workspaces/:id/chrome-host
 * Update the Chrome Tailscale host for a workspace
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params;

    // Authenticate
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const authService = getAuthService();
    const user = await authService.validateToken(token);

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    // Get workspace and verify ownership
    const workspaceService = await getWorkspaceService();
    const workspace = await workspaceService.getWorkspace(id);

    if (!workspace) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Workspace not found' } },
        { status: 404 }
      );
    }

    // Verify ownership through repository
    const { getRepositoryService } = await import('@/lib/services/repository-service');
    const repositoryService = getRepositoryService();
    const repository = await repositoryService.getRepository(workspace.repositoryId);

    if (!repository || repository.userId !== user.id) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Not authorized to modify this workspace' } },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { chromeHost } = body;

    console.log(`[Chrome Host API] Received update for workspace ${id}:`, chromeHost);

    // Validate chromeHost (optional Tailscale IP)
    if (chromeHost !== null && typeof chromeHost !== 'string') {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'chromeHost must be a string or null' } },
        { status: 400 }
      );
    }

    // Update workspace
    const { db } = await import('@/lib/db');
    const { workspaces } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');

    await db
      .update(workspaces)
      .set({ chromeTailscaleHost: chromeHost })
      .where(eq(workspaces.id, id));

    console.log(`[Chrome Host API] Updated database for workspace ${id}`);

    // Notify agent of the change via WebSocket
    const { getAgentRegistry } = await import('@/lib/services/agent-registry');
    const agentRegistry = getAgentRegistry();

    if (agentRegistry.hasAgent(id)) {
      // Send chrome host update to agent
      console.log(`[Chrome Host API] Notifying agent with chromeHost:`, chromeHost);
      agentRegistry.emit(id, 'chrome:host-update', { chromeHost });
    } else {
      console.log(`[Chrome Host API] No agent connected for workspace ${id}`);
    }

    return NextResponse.json({ success: true, chromeHost });
  } catch (error) {
    console.error('Failed to update Chrome host:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update Chrome host' } },
      { status: 500 }
    );
  }
}

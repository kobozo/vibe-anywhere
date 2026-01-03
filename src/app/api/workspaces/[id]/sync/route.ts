import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceService } from '@/lib/services/workspace-service';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/workspaces/:id/sync - Sync changes back from container
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: workspaceId } = await context.params;
    const workspaceService = await getWorkspaceService();

    await workspaceService.syncChangesBack(workspaceId);

    return NextResponse.json({
      success: true,
      message: 'Changes synced back from container',
    });
  } catch (error) {
    console.error('Failed to sync changes:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync changes' },
      { status: 500 }
    );
  }
}

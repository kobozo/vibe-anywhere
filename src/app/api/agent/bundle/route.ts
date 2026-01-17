import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// Path to the agent bundle
const AGENT_BUNDLE_PATH = process.env.AGENT_BUNDLE_PATH ||
  path.join(process.cwd(), 'packages', 'agent', 'agent-bundle.tar.gz');

// Expected agent version
const AGENT_VERSION = process.env.AGENT_VERSION || '3.1.1';

/**
 * GET /api/agent/bundle
 * Serves the agent bundle for self-updates
 */
export async function GET() {
  try {
    // Check if bundle exists
    await fs.access(AGENT_BUNDLE_PATH);

    // Read the bundle file
    const bundle = await fs.readFile(AGENT_BUNDLE_PATH);

    // Return as tar.gz
    return new NextResponse(bundle, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="agent-bundle-${AGENT_VERSION}.tar.gz"`,
        'Content-Length': bundle.length.toString(),
        'X-Agent-Version': AGENT_VERSION,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Failed to serve agent bundle:', error);

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json(
        {
          error: 'Agent bundle not found',
          message: 'Run "npm run build" in packages/agent to create the bundle',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to serve agent bundle' },
      { status: 500 }
    );
  }
}

/**
 * HEAD /api/agent/bundle
 * Returns bundle metadata without the file content
 */
export async function HEAD() {
  try {
    const stats = await fs.stat(AGENT_BUNDLE_PATH);

    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': stats.size.toString(),
        'X-Agent-Version': AGENT_VERSION,
        'Last-Modified': stats.mtime.toUTCString(),
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(null, { status: 500 });
  }
}

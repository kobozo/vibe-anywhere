import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// Path to the CDP shim bundle
const CDP_SHIM_BUNDLE_PATH = process.env.CDP_SHIM_BUNDLE_PATH ||
  path.join(process.cwd(), 'packages', 'cdp-proxy-shim', 'cdp-shim.tar.gz');

// Expected CDP shim version
const CDP_SHIM_VERSION = process.env.CDP_SHIM_VERSION || '1.0.0';

/**
 * GET /api/cdp-shim/bundle
 * Serves the CDP shim bundle for installation in containers
 */
export async function GET() {
  try {
    // Check if bundle exists
    await fs.access(CDP_SHIM_BUNDLE_PATH);

    // Read the bundle file
    const bundle = await fs.readFile(CDP_SHIM_BUNDLE_PATH);

    // Return as tar.gz
    return new NextResponse(bundle, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="cdp-shim-${CDP_SHIM_VERSION}.tar.gz"`,
        'Content-Length': bundle.length.toString(),
        'X-CDP-Shim-Version': CDP_SHIM_VERSION,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Failed to serve CDP shim bundle:', error);

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json(
        {
          error: 'CDP shim bundle not found',
          message: 'Run "npm run bundle" in packages/cdp-proxy-shim to create the bundle',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to serve CDP shim bundle' },
      { status: 500 }
    );
  }
}

/**
 * HEAD /api/cdp-shim/bundle
 * Returns bundle metadata without the file content
 */
export async function HEAD() {
  try {
    const stats = await fs.stat(CDP_SHIM_BUNDLE_PATH);

    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': stats.size.toString(),
        'X-CDP-Shim-Version': CDP_SHIM_VERSION,
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

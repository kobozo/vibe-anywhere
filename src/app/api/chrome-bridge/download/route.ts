import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// Path to the chrome-bridge script
const CHROME_BRIDGE_PATH = path.join(
  process.cwd(),
  'scripts',
  'chrome-bridge.js'
);

/**
 * GET /api/chrome-bridge/download
 * Serves the Chrome bridge script for download
 */
export async function GET() {
  try {
    // Check if script exists
    await fs.access(CHROME_BRIDGE_PATH);

    // Read the script
    const script = await fs.readFile(CHROME_BRIDGE_PATH, 'utf-8');

    // Return as downloadable file
    return new NextResponse(script, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Content-Disposition': 'attachment; filename="chrome-bridge.js"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Failed to serve chrome-bridge script:', error);

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json(
        {
          error: 'Chrome bridge script not found',
          message: 'The chrome-bridge.js file is missing from the server',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to serve chrome-bridge script' },
      { status: 500 }
    );
  }
}

/**
 * Proxmox Connection Test API
 * POST endpoint to test Proxmox connection credentials
 */

import { NextRequest } from 'next/server';
import proxmoxApi from 'proxmox-api';
import { requireAuth, successResponse, errorResponse, withErrorHandling } from '@/lib/api-utils';

interface TestConnectionRequest {
  host: string;
  port?: number;
  tokenId: string;
  tokenSecret: string;
  node: string;
}

/**
 * POST /api/proxmox/connection/test
 * Test Proxmox connection with provided credentials
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const body: TestConnectionRequest = await request.json();

  // Validate required fields
  if (!body.host || typeof body.host !== 'string') {
    return errorResponse('INVALID_HOST', 'Host is required and must be a string', 400);
  }
  if (!body.tokenId || typeof body.tokenId !== 'string') {
    return errorResponse('INVALID_TOKEN_ID', 'Token ID is required and must be a string', 400);
  }
  if (!body.tokenSecret || typeof body.tokenSecret !== 'string') {
    return errorResponse('INVALID_TOKEN_SECRET', 'Token secret is required and must be a string', 400);
  }
  if (!body.node || typeof body.node !== 'string') {
    return errorResponse('INVALID_NODE', 'Node is required and must be a string', 400);
  }

  const port = body.port ?? 8006;

  // Disable TLS verification for self-signed certs (common in homelabs)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    // Create a temporary Proxmox client for testing
    const proxmox = proxmoxApi({
      host: body.host,
      port,
      tokenID: body.tokenId,
      tokenSecret: body.tokenSecret,
    });

    // Test connection by getting nodes list
    const nodes = await proxmox.nodes.$get();

    // Find the specified node
    const targetNode = nodes.find((n: { node: string }) => n.node === body.node);
    if (!targetNode) {
      return errorResponse(
        'NODE_NOT_FOUND',
        `Node '${body.node}' not found. Available nodes: ${nodes.map((n: { node: string }) => n.node).join(', ')}`,
        400
      );
    }

    // Get version info
    let version = 'Unknown';
    try {
      const versionInfo = await proxmox.version.$get();
      version = versionInfo?.version || 'Unknown';
    } catch {
      // Version info not critical
    }

    return successResponse({
      success: true,
      message: `Connected to Proxmox VE ${version}`,
      version,
      node: targetNode.node,
      nodeStatus: targetNode.status || 'online',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Provide helpful error messages
    if (message.includes('ECONNREFUSED')) {
      return errorResponse(
        'CONNECTION_REFUSED',
        `Could not connect to ${body.host}:${port}. Ensure the Proxmox server is running and accessible.`,
        400
      );
    }
    if (message.includes('ETIMEDOUT') || message.includes('timeout')) {
      return errorResponse(
        'CONNECTION_TIMEOUT',
        `Connection to ${body.host}:${port} timed out. Check network connectivity.`,
        400
      );
    }
    if (message.includes('401') || message.includes('Unauthorized')) {
      return errorResponse(
        'AUTHENTICATION_FAILED',
        'Authentication failed. Check your Token ID and Token Secret.',
        401
      );
    }
    if (message.includes('403') || message.includes('Forbidden')) {
      return errorResponse(
        'PERMISSION_DENIED',
        'Permission denied. Ensure the API token has sufficient privileges.',
        403
      );
    }

    return errorResponse(
      'CONNECTION_FAILED',
      `Failed to connect: ${message}`,
      400
    );
  }
});

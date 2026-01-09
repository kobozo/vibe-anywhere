/**
 * API endpoint for fetching available CT templates from Proxmox storage
 * Returns apt-based templates (Debian, Ubuntu) that work with Vibe Anywhere provisioning
 *
 * This scans all nodes and storages for vztmpl content
 */

import { NextResponse } from 'next/server';
import { getProxmoxClientAsync } from '@/lib/container/proxmox/client';
import { getSettingsService } from '@/lib/services/settings-service';

export interface CtTemplate {
  id: string;        // Template identifier (e.g., 'debian-12-standard')
  volid: string;     // Full volume ID for container creation
  name: string;      // Display name (e.g., 'Debian 12 Standard')
  os: string;        // OS type (e.g., 'debian', 'ubuntu')
  version: string;   // Version string
  storage: string;   // Storage ID where template is located
  node: string;      // Node where template is stored
}

// Supported OS types for apt-based provisioning
const SUPPORTED_OS_TYPES = ['debian', 'ubuntu'];

/**
 * Parse template filename to extract display information
 * e.g., 'debian-12-standard_12.2-1_amd64.tar.zst' -> { os: 'Debian', version: '12', variant: 'Standard' }
 */
function parseTemplateName(filename: string): { osName: string; version: string; variant: string; id: string } {
  // Remove extension
  const baseName = filename.replace(/\.(tar\.(gz|zst|xz)|tar|gz)$/i, '');

  // Split on underscore to get the base template name (before version/arch parts)
  const templateBase = baseName.split('_')[0];
  const parts = templateBase.split('-');

  const osName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : 'Unknown';
  const version = parts[1] || '';
  const variant = parts.slice(2).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

  return {
    osName,
    version,
    variant,
    id: templateBase, // e.g., 'debian-12-standard'
  };
}

/**
 * GET /api/proxmox/ct-templates
 * Returns available CT templates from Proxmox storage, filtered to apt-based systems
 */
export async function GET() {
  try {
    // Check if Proxmox is configured
    const settingsService = getSettingsService();
    const connectionSettings = await settingsService.getProxmoxConnectionSettings();

    if (!connectionSettings) {
      return NextResponse.json(
        { error: 'Proxmox not configured' },
        { status: 400 }
      );
    }

    // Fetch stored templates from Proxmox storage
    const client = await getProxmoxClientAsync();
    const storedTemplates = await client.listStoredCtTemplates();

    // If no templates found, it might be a permission issue
    if (storedTemplates.length === 0) {
      console.warn('[CT Templates] No templates found - this may indicate missing API token permissions');
      console.warn('[CT Templates] Required permissions: Datastore.Audit and Datastore.AllocateSpace');
      console.warn('[CT Templates] Tip: Disable "Privilege Separation" on your API token to inherit all user permissions');
    }

    // Filter to supported OS types and transform to our format
    const ctTemplates: CtTemplate[] = storedTemplates
      .filter(template => {
        // Only include apt-based OS types
        if (!template.os) return false;
        return SUPPORTED_OS_TYPES.includes(template.os.toLowerCase());
      })
      .map(template => {
        const parsed = parseTemplateName(template.name);

        return {
          id: parsed.id,
          volid: template.volid,
          name: `${parsed.osName} ${parsed.version}${parsed.variant ? ' ' + parsed.variant : ''}`.trim(),
          os: template.os || 'unknown',
          version: template.version || parsed.version,
          storage: template.storage,
          node: template.node,
        };
      })
      // Sort by OS then version (descending for latest first)
      .sort((a, b) => {
        if (a.os !== b.os) return a.os.localeCompare(b.os);
        return b.version.localeCompare(a.version);
      });

    // Remove duplicates by volid (keep first occurrence)
    const seen = new Set<string>();
    const uniqueTemplates = ctTemplates.filter(t => {
      if (seen.has(t.volid)) return false;
      seen.add(t.volid);
      return true;
    });

    return NextResponse.json({ data: uniqueTemplates });
  } catch (error) {
    console.error('Failed to fetch CT templates:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch CT templates' },
      { status: 500 }
    );
  }
}

/**
 * Proxmox Tag Utilities
 *
 * Proxmox tag format requirements:
 * - Lowercase alphanumeric characters
 * - Allowed special chars: underscore, hyphen, plus, dot
 * - First character must be alphanumeric or underscore
 * - Tags are semicolon-separated when multiple
 */

/**
 * Sanitize a string to be a valid Proxmox tag
 * - Converts to lowercase
 * - Replaces invalid characters with hyphens
 * - Removes leading hyphens/dots/plus
 * - Collapses multiple hyphens
 * - Truncates to reasonable length
 */
export function sanitizeTag(input: string): string {
  if (!input) return '';

  return input
    .toLowerCase()
    .replace(/[^a-z0-9_\-+.]/g, '-') // Replace invalid chars with hyphen
    .replace(/^[^a-z0-9_]+/, '') // Remove invalid leading chars
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/-$/, '') // Remove trailing hyphen
    .substring(0, 50); // Limit length
}

/**
 * Build tags string for a workspace container
 * Includes: vibe-anywhere, repository name, tech stack IDs
 */
export function buildWorkspaceTags(
  repoName: string,
  techStackIds: string[]
): string {
  const tags: string[] = ['vibe-anywhere'];

  // Add sanitized repo name
  const sanitizedRepoName = sanitizeTag(repoName);
  if (sanitizedRepoName && !tags.includes(sanitizedRepoName)) {
    tags.push(sanitizedRepoName);
  }

  // Add tech stack IDs as tags (already lowercase identifiers)
  for (const stackId of techStackIds) {
    const sanitized = sanitizeTag(stackId);
    if (sanitized && !tags.includes(sanitized)) {
      tags.push(sanitized);
    }
  }

  return tags.join(';');
}

/**
 * Build tags string for a template container
 * Includes: vibe-anywhere, tech stack IDs
 */
export function buildTemplateTags(techStackIds: string[]): string {
  const tags: string[] = ['vibe-anywhere'];

  // Add tech stack IDs as tags
  for (const stackId of techStackIds) {
    const sanitized = sanitizeTag(stackId);
    if (sanitized && !tags.includes(sanitized)) {
      tags.push(sanitized);
    }
  }

  return tags.join(';');
}

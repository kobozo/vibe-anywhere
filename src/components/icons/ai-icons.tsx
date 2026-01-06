/**
 * Tab Template Icons
 *
 * This module provides icon rendering for tab templates:
 * - Built-in AI templates: Use official favicons from AI provider websites
 * - Custom templates: Use Material Icons
 * - Special icons: Git (GitHub), Docker (official)
 */

import Image from 'next/image';
import { getMaterialIcon } from './material-icons';

interface IconProps {
  className?: string;
}

/**
 * Built-in AI favicon paths - these are ONLY for built-in templates
 * and should NOT be exposed to custom template icon selection
 */
const AI_FAVICON_MAP: Record<string, string> = {
  claude: '/icons/ai/claude.ico',
  gemini: '/icons/ai/gemini.svg',
  codex: '/icons/ai/openai.png',
  copilot: '/icons/ai/copilot.svg',
  mistral: '/icons/ai/mistral.ico',
  cody: '/icons/ai/cody.svg',
  opencode: '/icons/ai/opencode.ico',
  // Special built-in icons
  git: '/icons/ai/github.png',
  docker: '/icons/ai/docker.png',
};

/**
 * Terminal icon (Material style) - used as fallback and for Terminal template
 */
function TerminalIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

/**
 * Favicon Image component for built-in AI templates
 */
function FaviconIcon({ src, alt, className }: { src: string; alt: string; className?: string }) {
  // Parse className to extract width/height (e.g., "w-6 h-6")
  const sizeMatch = className?.match(/w-(\d+)/);
  const size = sizeMatch ? parseInt(sizeMatch[1]) * 4 : 24; // Convert tailwind units to pixels

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      unoptimized // ICO and some SVGs need this
    />
  );
}

/**
 * Get the appropriate icon for a template
 *
 * @param iconKey - The icon identifier stored in the template
 * @param isBuiltIn - Whether this is a built-in template (uses AI favicons)
 * @param className - CSS classes for sizing (e.g., "w-6 h-6")
 */
export function getTemplateIcon(
  iconKey: string,
  isBuiltIn: boolean,
  className?: string
): React.ReactNode {
  // Built-in templates with AI favicons
  if (isBuiltIn && AI_FAVICON_MAP[iconKey]) {
    return (
      <FaviconIcon
        src={AI_FAVICON_MAP[iconKey]}
        alt={iconKey}
        className={className}
      />
    );
  }

  // Terminal is a special case - always use Material Icon style
  if (iconKey === 'terminal') {
    return <TerminalIcon className={className} />;
  }

  // Custom templates use Material Icons
  const MaterialIconComponent = getMaterialIcon(iconKey);
  return <MaterialIconComponent className={className} />;
}

/**
 * @deprecated Use getTemplateIcon instead
 * Legacy function for backward compatibility
 */
export function getAIIcon(key: string): React.FC<IconProps> {
  // Return a component that uses getTemplateIcon
  return function LegacyIcon({ className }: IconProps) {
    // Check if it's an AI icon key
    if (AI_FAVICON_MAP[key]) {
      return (
        <FaviconIcon
          src={AI_FAVICON_MAP[key]}
          alt={key}
          className={className}
        />
      );
    }
    // Otherwise use Material Icon
    const MaterialIconComponent = getMaterialIcon(key);
    return <MaterialIconComponent className={className} />;
  };
}

/**
 * Check if an icon key is a built-in AI favicon
 */
export function isAIFavicon(iconKey: string): boolean {
  return iconKey in AI_FAVICON_MAP;
}

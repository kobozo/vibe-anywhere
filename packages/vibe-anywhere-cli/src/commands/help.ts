/**
 * Show help command
 */

import { VERSION } from '../version.js';

export function showHelp(): void {
  console.log(`Vibe Anywhere CLI v${VERSION}`);
  console.log('');
  console.log('Usage: vibe-anywhere <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  reload env          Reload environment variables in current shell');
  console.log('                      Usage: eval $(vibe-anywhere reload env)');
  console.log('');
  console.log('  status              Show agent status and connection info');
  console.log('  info                Show workspace information');
  console.log('  help                Show this help message');
  console.log('  --version, -v       Show version number');
  console.log('');
  console.log('Examples:');
  console.log('  # Reload environment variables');
  console.log('  eval $(vibe-anywhere reload env)');
  console.log('');
  console.log('  # Or use the alias (if configured)');
  console.log('  reload-env');
  console.log('');
  console.log('  # Check agent status');
  console.log('  vibe-anywhere status');
  console.log('');
  console.log('For more information, visit: https://github.com/kobozo/vibe-anywhere');
}

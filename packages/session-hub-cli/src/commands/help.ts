/**
 * Show help command
 */

import { VERSION } from '../version.js';

export function showHelp(): void {
  console.log(`Session Hub CLI v${VERSION}`);
  console.log('');
  console.log('Usage: session-hub <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  reload env          Reload environment variables in current shell');
  console.log('                      Usage: eval $(session-hub reload env)');
  console.log('');
  console.log('  status              Show agent status and connection info');
  console.log('  info                Show workspace information');
  console.log('  help                Show this help message');
  console.log('  --version, -v       Show version number');
  console.log('');
  console.log('Examples:');
  console.log('  # Reload environment variables');
  console.log('  eval $(session-hub reload env)');
  console.log('');
  console.log('  # Or use the alias (if configured)');
  console.log('  reload-env');
  console.log('');
  console.log('  # Check agent status');
  console.log('  session-hub status');
  console.log('');
  console.log('For more information, visit: https://github.com/session-hub/session-hub');
}

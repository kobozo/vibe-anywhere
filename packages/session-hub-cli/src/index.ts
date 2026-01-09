/**
 * Session Hub CLI
 * Main entry point
 */

import { reloadEnv } from './commands/reload-env.js';
import { showStatus } from './commands/status.js';
import { showInfo } from './commands/info.js';
import { showHelp } from './commands/help.js';
import { VERSION } from './version.js';

async function main() {
  const args = process.argv.slice(2);

  // No arguments - show help
  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const command = args[0];
  const subcommand = args[1];

  // Version flag
  if (command === '--version' || command === '-v') {
    console.log(VERSION);
    process.exit(0);
  }

  // Help command
  if (command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  // Reload env command
  if (command === 'reload' && subcommand === 'env') {
    await reloadEnv();
    process.exit(0);
  }

  // Alternate syntax: env reload
  if (command === 'env' && subcommand === 'reload') {
    await reloadEnv();
    process.exit(0);
  }

  // Status command
  if (command === 'status') {
    await showStatus();
    process.exit(0);
  }

  // Info command
  if (command === 'info') {
    await showInfo();
    process.exit(0);
  }

  // Unknown command
  console.error(`Unknown command: ${args.join(' ')}`);
  console.error('');
  showHelp();
  process.exit(1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

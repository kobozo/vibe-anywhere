/**
 * Reload environment variables command
 * Fetches latest env vars from agent and outputs export statements
 */

import { IpcClient } from '../ipc-client.js';

export async function reloadEnv(): Promise<void> {
  try {
    const client = new IpcClient();

    if (!client.isAgentRunning()) {
      console.error('Error: Session Hub agent is not running.');
      console.error('Make sure you are inside a Session Hub workspace.');
      process.exit(1);
    }

    // Fetch environment variables from agent
    const envVars = await client.getEnvVars();

    // Output usage hint to stderr (won't be captured by eval)
    console.error('# Note: This command only prints export statements.');
    console.error('# To execute them, use: eval $(session-hub reload env)');
    console.error('# Or simply use the alias: reload-env');
    console.error('');

    // Output export statements for eval
    for (const [key, value] of Object.entries(envVars)) {
      // Escape single quotes in value: replace ' with '\''
      const escapedValue = value.replace(/'/g, "'\\''");
      console.log(`export ${key}='${escapedValue}'`);
    }

    // Success - no error output
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

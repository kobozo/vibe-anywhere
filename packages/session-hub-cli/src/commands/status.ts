/**
 * Show agent status command
 */

import { IpcClient } from '../ipc-client.js';

export async function showStatus(): Promise<void> {
  try {
    const client = new IpcClient();

    if (!client.isAgentRunning()) {
      console.log('Status: Agent not running');
      console.log('Make sure you are inside a Session Hub workspace.');
      process.exit(1);
    }

    const status = await client.getStatus();

    console.log('Session Hub Agent Status');
    console.log('========================');
    console.log(`Version:        ${status.version}`);
    console.log(`Connected:      ${status.connected ? 'Yes' : 'No'}`);
    console.log(`Workspace ID:   ${status.workspaceId}`);
    console.log(`Server URL:     ${status.sessionHubUrl}`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

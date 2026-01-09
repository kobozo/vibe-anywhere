/**
 * Show workspace info command
 */

import { IpcClient } from '../ipc-client.js';

export async function showInfo(): Promise<void> {
  try {
    const client = new IpcClient();

    if (!client.isAgentRunning()) {
      console.log('Error: Agent not running');
      console.log('Make sure you are inside a Session Hub workspace.');
      process.exit(1);
    }

    const status = await client.getStatus();

    console.log('Workspace Information');
    console.log('====================');
    console.log(`Workspace ID: ${status.workspaceId}`);
    console.log(`Agent Version: ${status.version}`);
    console.log(`Server: ${status.sessionHubUrl}`);
    console.log(`Status: ${status.connected ? 'Connected' : 'Disconnected'}`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

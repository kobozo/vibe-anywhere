/**
 * Test script to simulate agent connection to Vibe Anywhere
 * Run with: npx tsx packages/agent/test-connection.ts
 */

import { io, Socket } from 'socket.io-client';

const SESSION_HUB_URL = process.env.SESSION_HUB_URL || 'http://localhost:3000';
const WORKSPACE_ID = process.env.WORKSPACE_ID || 'test-workspace-123';
const AGENT_TOKEN = process.env.AGENT_TOKEN || 'test-token-abc';

console.log('Agent Test Script');
console.log('==================');
console.log(`Vibe Anywhere URL: ${SESSION_HUB_URL}`);
console.log(`Workspace ID: ${WORKSPACE_ID}`);
console.log(`Agent Token: ${AGENT_TOKEN.substring(0, 8)}...`);
console.log('');

const socket: Socket = io(`${SESSION_HUB_URL}/agent`, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
  timeout: 10000,
});

socket.on('connect', () => {
  console.log('✓ Connected to Vibe Anywhere');
  console.log(`  Socket ID: ${socket.id}`);

  // Register the agent
  console.log('\n→ Sending agent:register...');
  socket.emit('agent:register', {
    workspaceId: WORKSPACE_ID,
    token: AGENT_TOKEN,
    version: '1.0.0',
  });
});

socket.on('agent:registered', (data: { success: boolean; error?: string }) => {
  if (data.success) {
    console.log('✓ Agent registered successfully');

    // Send a heartbeat
    setTimeout(() => {
      console.log('\n→ Sending agent:heartbeat...');
      socket.emit('agent:heartbeat', {
        tabs: [],
        metrics: {
          uptime: 5000,
          memory: process.memoryUsage().heapUsed,
        },
      });
    }, 1000);

    // Disconnect after a few seconds
    setTimeout(() => {
      console.log('\n✓ Test completed successfully');
      socket.disconnect();
      process.exit(0);
    }, 3000);
  } else {
    console.log(`✗ Registration failed: ${data.error}`);
    socket.disconnect();
    process.exit(1);
  }
});

socket.on('agent:update', (data: { version: string; bundleUrl: string }) => {
  console.log(`\n! Update available: v${data.version}`);
  console.log(`  Bundle URL: ${data.bundleUrl}`);
});

socket.on('tab:create', (data: { tabId: string; command: string[] }) => {
  console.log(`\n← Received tab:create for ${data.tabId}`);
  console.log(`  Command: ${data.command.join(' ')}`);

  // Simulate tab created response
  socket.emit('tab:created', {
    tabId: data.tabId,
    success: true,
  });

  // Simulate some output
  setTimeout(() => {
    socket.emit('tab:output', {
      tabId: data.tabId,
      data: 'Hello from simulated agent!\r\n',
    });
  }, 500);
});

socket.on('tab:input', (data: { tabId: string; data: string }) => {
  console.log(`\n← Received tab:input for ${data.tabId}: ${JSON.stringify(data.data)}`);
});

socket.on('tab:resize', (data: { tabId: string; cols: number; rows: number }) => {
  console.log(`\n← Received tab:resize for ${data.tabId}: ${data.cols}x${data.rows}`);
});

socket.on('tab:close', (data: { tabId: string }) => {
  console.log(`\n← Received tab:close for ${data.tabId}`);
});

socket.on('connect_error', (error: Error) => {
  console.log(`✗ Connection error: ${error.message}`);
});

socket.on('disconnect', (reason: string) => {
  console.log(`\n! Disconnected: ${reason}`);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('\n✗ Test timed out');
  socket.disconnect();
  process.exit(1);
}, 10000);

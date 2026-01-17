#!/usr/bin/env node
/**
 * Chrome Native Host for Mac
 * Connects to Claude Code MCP socket in remote workspace via Tailscale
 */

const net = require('net');

// Workspace Tailscale IP and port for MCP socket proxy
const WORKSPACE_HOST = '100.65.1.110'; // The workspace's Tailscale IP
const WORKSPACE_PORT = 19223; // New port for reverse MCP proxy

// Connect to workspace
const socket = net.connect(WORKSPACE_PORT, WORKSPACE_HOST);

// Log to stderr (Chrome native messaging uses stdout for data)
socket.on('connect', () => {
  console.error('[Native Host] Connected to workspace Claude Code via Tailscale');
});

// Pipe data bidirectionally between stdin/stdout and TCP socket
socket.on('data', (data) => process.stdout.write(data));
process.stdin.on('data', (data) => socket.write(data));

socket.on('error', (err) => {
  console.error('[Native Host] Socket error:', err.message);
  process.exit(1);
});

socket.on('end', () => {
  console.error('[Native Host] Connection closed');
  process.exit(0);
});

process.stdin.on('end', () => socket.end());

import 'dotenv/config';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { createSocketServer } from './src/lib/websocket/server';
import { initializeBackend } from './src/lib/container/backend-factory';
import { getContainerStatusSyncService } from './src/lib/services/container-status-sync';
import { runMigrations } from './src/lib/db/migrate';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function start() {
  // Run database migrations on startup
  try {
    await runMigrations();
  } catch (error) {
    console.error('Failed to run migrations:', error);
    process.exit(1);
  }

  await app.prepare();

  // Initialize container backend (Docker or Proxmox)
  try {
    await initializeBackend();
  } catch (error) {
    console.error('Failed to initialize container backend:', error);
    // Continue anyway - backend may be optional for some routes
  }

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.io server
  const io = createSocketServer(httpServer);

  // Start container status sync service (checks Proxmox for manual changes)
  try {
    const syncService = getContainerStatusSyncService();
    await syncService.start();
  } catch (error) {
    console.error('Failed to start container status sync service:', error);
    // Continue anyway - sync service is not critical for operation
  }

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.io server ready`);
    console.log(`> Environment: ${dev ? 'development' : 'production'}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

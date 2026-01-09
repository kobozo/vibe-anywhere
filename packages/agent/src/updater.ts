/**
 * Agent self-updater
 * Downloads and installs new versions when instructed by Vibe Anywhere
 */

import { exec as execCb, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const exec = promisify(execCb);

const AGENT_DIR = '/opt/vibe-anywhere-agent';
const NEW_DIR = '/opt/vibe-anywhere-agent-new';
const BACKUP_DIR = '/opt/vibe-anywhere-agent-backup';

export interface UpdateResult {
  success: boolean;
  error?: string;
}

/**
 * Download a file from URL to destination
 */
async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const file = createWriteStream(dest);

    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlink(dest).catch(() => {});
      reject(err);
    });
  });
}

/**
 * Perform self-update (binary version)
 * Downloads standalone binary bundle and atomically swaps directories
 * Uses sudo for directory operations since agent runs as kobozo but /opt needs root
 * Service restart via systemd causes ~1-2 sec disconnect with auto-reconnection
 */
export async function selfUpdate(bundleUrl: string, newVersion: string): Promise<UpdateResult> {
  console.log(`Starting self-update to version ${newVersion}...`);
  console.log(`Bundle URL: ${bundleUrl}`);

  try {
    // 1. Clean up any previous failed updates (use sudo)
    await exec(`sudo rm -rf ${NEW_DIR} ${BACKUP_DIR}`);

    // 2. Create new directory (use sudo, then chown to current user)
    await exec(`sudo mkdir -p ${NEW_DIR} && sudo chown $(whoami):$(whoami) ${NEW_DIR}`);

    // 3. Download the bundle
    const bundlePath = path.join(NEW_DIR, 'agent-bundle.tar.gz');
    console.log('Downloading bundle...');
    await downloadFile(bundleUrl, bundlePath);

    // 4. Extract the bundle
    console.log('Extracting bundle...');
    await exec(`tar -xzf agent-bundle.tar.gz`, { cwd: NEW_DIR });
    await fs.unlink(bundlePath);

    // 5. Verify the new version works (test the binary)
    console.log('Verifying new binary...');
    const { stdout } = await exec('./vibe-anywhere-agent --version || echo "ok"', {
      cwd: NEW_DIR,
      timeout: 5000,
    });
    console.log('Verification output:', stdout.trim());

    // 7. Swap directories atomically (use sudo for /opt operations)
    console.log('Swapping versions...');

    // Move current to backup
    try {
      await exec(`sudo mv ${AGENT_DIR} ${BACKUP_DIR}`);
    } catch (err) {
      // Current dir might not exist on fresh install
      console.log('No existing agent to backup');
    }

    // Move new to current and ensure correct ownership
    await exec(`sudo mv ${NEW_DIR} ${AGENT_DIR} && sudo chown -R $(whoami):$(whoami) ${AGENT_DIR}`);

    console.log(`Update to version ${newVersion} complete. Restarting...`);

    // 8. Restart the systemd service (use sudo)
    // This is cleaner than exit(0) and ensures proper service restart
    setTimeout(async () => {
      try {
        await exec('sudo systemctl restart vibe-anywhere-agent');
      } catch {
        // If systemctl fails, fall back to exit
        process.exit(0);
      }
    }, 500);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Update failed:', message);

    // Attempt rollback if we have a backup
    try {
      const backupExists = await exec(`test -d ${BACKUP_DIR} && echo "yes"`).then(() => true).catch(() => false);
      const currentExists = await exec(`test -d ${AGENT_DIR} && echo "yes"`).then(() => true).catch(() => false);

      if (backupExists && !currentExists) {
        console.log('Rolling back to previous version...');
        await exec(`sudo mv ${BACKUP_DIR} ${AGENT_DIR}`);
      }
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError);
    }

    // Clean up failed update
    await exec(`sudo rm -rf ${NEW_DIR}`).catch(() => {});

    return { success: false, error: message };
  }
}

/**
 * Check if an update is available by comparing versions
 */
export function shouldUpdate(currentVersion: string, newVersion: string): boolean {
  // Simple semver comparison
  const current = currentVersion.split('.').map(Number);
  const next = newVersion.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const c = current[i] || 0;
    const n = next[i] || 0;
    if (n > c) return true;
    if (n < c) return false;
  }

  return false; // Equal versions
}

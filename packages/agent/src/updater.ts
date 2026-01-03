/**
 * Agent self-updater
 * Downloads and installs new versions when instructed by Session Hub
 */

import { exec as execCb, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const exec = promisify(execCb);

const AGENT_DIR = '/opt/session-hub-agent';
const NEW_DIR = '/opt/session-hub-agent-new';
const BACKUP_DIR = '/opt/session-hub-agent-backup';

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

    const file = require('fs').createWriteStream(dest);

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
 * Perform self-update
 */
export async function selfUpdate(bundleUrl: string, newVersion: string): Promise<UpdateResult> {
  console.log(`Starting self-update to version ${newVersion}...`);
  console.log(`Bundle URL: ${bundleUrl}`);

  try {
    // 1. Clean up any previous failed updates
    await fs.rm(NEW_DIR, { recursive: true, force: true });
    await fs.rm(BACKUP_DIR, { recursive: true, force: true });

    // 2. Create new directory
    await fs.mkdir(NEW_DIR, { recursive: true });

    // 3. Download the bundle
    const bundlePath = path.join(NEW_DIR, 'agent-bundle.tar.gz');
    console.log('Downloading bundle...');
    await downloadFile(bundleUrl, bundlePath);

    // 4. Extract the bundle
    console.log('Extracting bundle...');
    await exec(`tar -xzf agent-bundle.tar.gz`, { cwd: NEW_DIR });
    await fs.unlink(bundlePath);

    // 5. Install dependencies
    console.log('Installing dependencies...');
    await exec('npm install --production --ignore-scripts', { cwd: NEW_DIR });

    // 6. Verify the new version works (basic check)
    console.log('Verifying new version...');
    const { stdout } = await exec('node dist/index.js --version || echo "ok"', {
      cwd: NEW_DIR,
      timeout: 5000,
    });
    console.log('Verification output:', stdout.trim());

    // 7. Swap directories atomically
    console.log('Swapping versions...');

    // Move current to backup
    try {
      await fs.rename(AGENT_DIR, BACKUP_DIR);
    } catch (err) {
      // Current dir might not exist on fresh install
      console.log('No existing agent to backup');
    }

    // Move new to current
    await fs.rename(NEW_DIR, AGENT_DIR);

    console.log(`Update to version ${newVersion} complete. Restarting...`);

    // 8. Exit to let systemd restart us with the new version
    // Give a moment for logs to flush
    setTimeout(() => {
      process.exit(0);
    }, 500);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Update failed:', message);

    // Attempt rollback if we have a backup
    try {
      const backupExists = await fs.access(BACKUP_DIR).then(() => true).catch(() => false);
      const currentExists = await fs.access(AGENT_DIR).then(() => true).catch(() => false);

      if (backupExists && !currentExists) {
        console.log('Rolling back to previous version...');
        await fs.rename(BACKUP_DIR, AGENT_DIR);
      }
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError);
    }

    // Clean up failed update
    await fs.rm(NEW_DIR, { recursive: true, force: true });

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

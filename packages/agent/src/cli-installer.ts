/**
 * CLI Installer for Session Hub CLI
 * Manages installation and updates of the session-hub CLI tool
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface CliInstallerConfig {
  version: string;
  cliSourcePath: string; // Path to CLI binary in agent bundle
  cliInstallPath: string; // Where to install CLI (e.g., /usr/local/bin/session-hub)
  bashrcPath: string; // Path to user's .bashrc
}

export class CliInstaller {
  constructor(private config: CliInstallerConfig) {}

  /**
   * Check if CLI is installed and up-to-date
   */
  async isCliUpToDate(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('session-hub --version');
      const cliVersion = stdout.trim();
      return cliVersion === this.config.version;
    } catch {
      return false;
    }
  }

  /**
   * Install or update the CLI
   */
  async installCli(): Promise<void> {
    console.log(`Installing session-hub CLI v${this.config.version}...`);

    // Check if source CLI exists
    if (!fs.existsSync(this.config.cliSourcePath)) {
      throw new Error(`CLI source not found at: ${this.config.cliSourcePath}`);
    }

    // Create install directory if needed
    const installDir = path.dirname(this.config.cliInstallPath);
    if (!fs.existsSync(installDir)) {
      await execAsync(`sudo mkdir -p ${installDir}`);
    }

    // Remove old symlink/file if exists
    if (fs.existsSync(this.config.cliInstallPath)) {
      try {
        await execAsync(`sudo rm -f ${this.config.cliInstallPath}`);
      } catch (error) {
        await execAsync(`rm -f ${this.config.cliInstallPath}`);
      }
    }

    // Create symlink to CLI (preserves directory structure for imports)
    try {
      await execAsync(`sudo ln -s ${this.config.cliSourcePath} ${this.config.cliInstallPath}`);
      console.log(`✓ CLI symlinked to ${this.config.cliInstallPath}`);
    } catch (error) {
      console.error('Failed to create symlink with sudo, trying without sudo...');
      await execAsync(`ln -s ${this.config.cliSourcePath} ${this.config.cliInstallPath}`);
      console.log(`✓ CLI symlinked to ${this.config.cliInstallPath}`);
    }

    // Verify installation
    try {
      const { stdout } = await execAsync('session-hub --version');
      const installedVersion = stdout.trim();
      if (installedVersion === this.config.version) {
        console.log(`✓ CLI version verified: ${installedVersion}`);
      } else {
        console.warn(`Warning: Version mismatch. Expected ${this.config.version}, got ${installedVersion}`);
      }
    } catch (error) {
      throw new Error(`CLI installation verification failed: ${error}`);
    }
  }

  /**
   * Ensure the reload-env alias exists in .bashrc
   */
  async ensureBashrcAlias(): Promise<void> {
    if (!fs.existsSync(this.config.bashrcPath)) {
      console.warn(`.bashrc not found at ${this.config.bashrcPath}`);
      return;
    }

    try {
      const bashrc = await fs.promises.readFile(this.config.bashrcPath, 'utf8');

      if (!bashrc.includes('reload-env')) {
        const aliasLine = "alias reload-env='eval $(session-hub reload env)'";
        const addition = `\n# Session Hub helper alias\n${aliasLine}\n`;
        await fs.promises.appendFile(this.config.bashrcPath, addition);
        console.log('✓ Added reload-env alias to .bashrc');
      } else {
        console.log('✓ reload-env alias already exists in .bashrc');
      }
    } catch (error) {
      console.warn('Could not update .bashrc:', error);
    }
  }

  /**
   * Full installation check and update
   */
  async ensureCliInstalled(): Promise<void> {
    try {
      const upToDate = await this.isCliUpToDate();

      if (!upToDate) {
        const cliExists = fs.existsSync(this.config.cliInstallPath);
        if (cliExists) {
          console.log('CLI version mismatch, updating...');
        } else {
          console.log('CLI not found, installing...');
        }
        await this.installCli();
      } else {
        console.log(`✓ CLI version ${this.config.version} is up-to-date`);
      }

      // Ensure alias exists (idempotent)
      await this.ensureBashrcAlias();
    } catch (error) {
      console.error('CLI installation check failed:', error);
      throw error;
    }
  }
}

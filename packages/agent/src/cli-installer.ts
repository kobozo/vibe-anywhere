/**
 * CLI Installer for Vibe Anywhere CLI
 * Manages installation and updates of the vibe-anywhere CLI tool
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface CliInstallerConfig {
  version: string;
  cliSourcePath: string; // Path to CLI binary in agent bundle
  cliInstallPath: string; // Where to install CLI (e.g., /usr/local/bin/vibe-anywhere)
  bashrcPath: string; // Path to user's .bashrc
}

export class CliInstaller {
  constructor(private config: CliInstallerConfig) {}

  /**
   * Check if CLI is installed and up-to-date
   */
  async isCliUpToDate(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('vibe-anywhere --version');
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
    console.log(`Installing vibe-anywhere CLI v${this.config.version}...`);

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
      const { stdout } = await execAsync('vibe-anywhere --version');
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
   * Updates the alias if it's outdated (missing --no-comments)
   */
  async ensureBashrcAlias(): Promise<void> {
    if (!fs.existsSync(this.config.bashrcPath)) {
      console.warn(`.bashrc not found at ${this.config.bashrcPath}`);
      return;
    }

    try {
      let bashrc = await fs.promises.readFile(this.config.bashrcPath, 'utf8');
      const currentAliasLine = "alias reload-env='eval $(vibe-anywhere reload env --no-comments)'";

      // Check if the correct (current) alias exists
      if (bashrc.includes(currentAliasLine)) {
        console.log('✓ reload-env alias is up-to-date in .bashrc');
        return;
      }

      // Check if an old alias exists (without --no-comments)
      const oldAliasRegex = /alias reload-env='eval \$\(vibe-anywhere reload env\)'/;
      if (oldAliasRegex.test(bashrc)) {
        // Update the old alias
        bashrc = bashrc.replace(oldAliasRegex, currentAliasLine);
        await fs.promises.writeFile(this.config.bashrcPath, bashrc, 'utf8');
        console.log('✓ Updated reload-env alias in .bashrc (added --no-comments)');
        return;
      }

      // No alias exists, add it
      if (!bashrc.includes('reload-env')) {
        const addition = `\n# Vibe Anywhere helper alias\n${currentAliasLine}\n`;
        await fs.promises.appendFile(this.config.bashrcPath, addition);
        console.log('✓ Added reload-env alias to .bashrc');
      } else {
        console.log('✓ reload-env alias already exists in .bashrc (unknown format)');
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

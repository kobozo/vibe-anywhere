import { ProxmoxClient } from './client';

/**
 * Sleep for the specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll a Proxmox task until it completes
 *
 * @param client - Proxmox client instance
 * @param upid - Task UPID to poll
 * @param options - Polling options
 * @returns Promise that resolves when task completes successfully
 * @throws Error if task fails or times out
 */
export async function pollTaskUntilComplete(
  client: ProxmoxClient,
  upid: string,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    onProgress?: (status: string) => void;
  } = {}
): Promise<void> {
  const { timeoutMs = 120000, pollIntervalMs = 2000, onProgress } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const status = await client.getTaskStatus(upid);

      if (onProgress) {
        onProgress(status.status);
      }

      if (status.status === 'stopped') {
        // Task completed - check exit status
        if (status.exitstatus === 'OK') {
          return; // Success
        }
        throw new Error(`Proxmox task failed: ${status.exitstatus || 'Unknown error'}`);
      }

      // Task still running, wait and poll again
      await sleep(pollIntervalMs);
    } catch (error) {
      // If we get an error fetching status, it might be a transient issue
      // Wait and retry unless we've timed out
      if (Date.now() - startTime >= timeoutMs) {
        throw error;
      }
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(`Proxmox task polling timed out after ${timeoutMs}ms. UPID: ${upid}`);
}

/**
 * Wait for an LXC container to get an IP address via DHCP
 *
 * @param client - Proxmox client instance
 * @param vmid - Container VMID
 * @param options - Polling options
 * @returns The IP address once available
 */
export async function waitForContainerIp(
  client: ProxmoxClient,
  vmid: number,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    interfaceName?: string;
    triggerDhcp?: boolean;  // Try to trigger DHCP via pct exec if taking too long
  } = {}
): Promise<string> {
  const { timeoutMs = 90000, pollIntervalMs = 3000, interfaceName = 'eth0', triggerDhcp = true } = options;
  let dhcpTriggered = false;

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const interfaces = await client.getLxcInterfaces(vmid);

      // Find the specified interface
      const iface = interfaces.find(i => i.name === interfaceName);
      if (iface && iface['ip-addresses']) {
        // Look for IPv4 address
        const ipv4 = iface['ip-addresses'].find(
          addr => addr['ip-address-type'] === 'inet' && !addr['ip-address'].startsWith('127.')
        );

        if (ipv4) {
          return ipv4['ip-address'];
        }
      }

      // Also try to get IP from container config (some setups store it there)
      const config = await client.getLxcConfig(vmid);
      if (config.net0 && typeof config.net0 === 'string') {
        // Parse net0 config like "name=eth0,bridge=vmbr0,ip=192.168.1.100/24"
        const ipMatch = config.net0.match(/ip=(\d+\.\d+\.\d+\.\d+)/);
        if (ipMatch && !ipMatch[1].startsWith('127.')) {
          return ipMatch[1];
        }
      }

      // If we've waited a while and still no IP, try triggering DHCP
      const elapsed = Date.now() - startTime;
      if (triggerDhcp && !dhcpTriggered && elapsed > 15000) {
        console.log(`Container ${vmid} has no IP after ${elapsed}ms, triggering DHCP...`);
        try {
          // Try to run dhclient via Proxmox API exec
          await client.execInLxc(vmid, ['dhclient', interfaceName]);
          dhcpTriggered = true;
          console.log(`DHCP triggered for container ${vmid}`);
        } catch (e) {
          // dhclient might not be available or might fail, continue polling
          console.warn(`Could not trigger DHCP for container ${vmid}:`, e);
          dhcpTriggered = true; // Don't retry
        }
      }

      await sleep(pollIntervalMs);
    } catch (error) {
      // Container might not be fully started yet
      if (Date.now() - startTime >= timeoutMs) {
        throw new Error(`Failed to get container IP: ${error}`);
      }
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(`Timed out waiting for container ${vmid} to get IP address`);
}

/**
 * Wait for an LXC container to be in running state
 */
export async function waitForContainerRunning(
  client: ProxmoxClient,
  vmid: number,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<void> {
  const { timeoutMs = 60000, pollIntervalMs = 2000 } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const status = await client.getLxcStatus(vmid);

      if (status.status === 'running') {
        return;
      }

      if (status.status === 'stopped') {
        throw new Error(`Container ${vmid} is stopped, expected running`);
      }

      await sleep(pollIntervalMs);
    } catch (error) {
      if (Date.now() - startTime >= timeoutMs) {
        throw error;
      }
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(`Timed out waiting for container ${vmid} to start`);
}

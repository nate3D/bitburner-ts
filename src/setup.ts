import { NS } from "@ns";
import { gatherConstants } from "src/main";

/** Main function to deploy a script to all available servers
 * @param {NS} ns - Netscript API object
 */
export async function main(ns: NS): Promise<void> {
  if (ns.args.length < 1) {
    ns.tprint("Usage: run setup.js force=[true|false]");
    return;
  }

  const force = ns.args[0] === "true" || ns.args[0] === true;
  const allServers = await getAllServers(ns);
  const hackScript = "formulas_hack.js";
  const payloads = [
    "scripts/hack.js",
    "scripts/weaken.js",
    "scripts/grow.js",
    "logger.js",
  ];
  payloads.push(hackScript);
  const servers: string[] = [];
  const jobServers: string[] = [];
  const emptyServers: string[] = [];
  const emptyServersFile = "/empty-servers.txt";
  const failedServers: string[] = [];
  const failedServersFile = "/failed-servers.txt";

  // Identify vulnerable servers, excluding "srv" servers and home
  for (const server of allServers) {
    if (
      server.startsWith("mgmt") ||
      server.startsWith("home")
    ) {
      ns.tprint(`Skipping private server: ${server}`);
      continue;
    }

    if (server.startsWith("srv")) {
      jobServers.push(server);
      continue;
    }

    if (!ns.hasRootAccess(server)) {
      let openPorts = 0;

      // Check for port-opening programs and open ports
      if (ns.fileExists("BruteSSH.exe", "home")) {
        ns.brutessh(server);
        openPorts++;
      }
      if (ns.fileExists("FTPCrack.exe", "home")) {
        ns.ftpcrack(server);
        openPorts++;
      }
      if (ns.fileExists("relaySMTP.exe", "home")) {
        ns.relaysmtp(server);
        openPorts++;
      }
      if (ns.fileExists("HTTPWorm.exe", "home")) {
        ns.httpworm(server);
        openPorts++;
      }
      if (ns.fileExists("SQLInject.exe", "home")) {
        ns.sqlinject(server);
        openPorts++;
      }


      // Check if enough ports are open to nuke
      if (openPorts >= ns.getServerNumPortsRequired(server)) {
        ns.nuke(server);
      }
    }

    if (ns.hasRootAccess(server)) {
      servers.push(server);
    }

    // Create a datafile for each server
    const datafile = await gatherConstants(ns, server, hackScript);
    await ns.scp(datafile, server, "home");
  }

  // Deploy the payload to all job servers
  for (const server of jobServers) {
    ns.tprint(`Deploying to job server ${server}...`);
    await ns.sleep(1000);

    // Kill all processes on the server
    killAllProcesses(ns, server);

    try {
      // Copy the target script to the server
      for (const payload of payloads) {
        const copySuccess = await ns.scp(payload, server, "home");
        if (copySuccess) {
          ns.tprint(`Successfully copied ${payload} to ${server}`);
        } else {
          ns.tprint(`Failed to copy ${payload} to ${server}`);
          failedServers.push(server);
          continue; // Skip to the next server
        }
      }

      // Copy all datafiles to the job server
      for (const server of servers) {
        // Create the datafile and gather constants
        const datafile = `data/${server}-constants.json`;
        await ns.scp(datafile, server, "home");
      }
    } catch (error) {
      ns.tprint(`Error handling server ${server}: ${error}`);
      failedServers.push(server);
    }
  }

  if (servers.length === 0) {
    ns.tprint(`No vulnerable servers found.`);
    return;
  }

  ns.tprint(
    `Found ${servers.length} vulnerable servers: ${servers.join(", ")}`
  );
  await ns.sleep(5000);

  // Deploy and run scripts on the vulnerable servers
  for (const server of servers) {
    ns.tprint("");

    // Check if server has any money
    ns.tprint(`Checking ${server} max money...`);
    const serverMaxMoney = ns.getServerMaxMoney(server);
    if (serverMaxMoney === 0) {
      emptyServers.push(server);
      ns.tprint(`${server} does not have any funds, adding to list`);
      continue;
    }

    // Check if server is currently running our work
    ns.tprint(`Checking if ${server} is running...`);
    if (!force) {
      const processes = ns.ps(server);
      const isRunningHackJs = processes.some(
        (proc) => proc.filename === "hack.js"
      );
      if (isRunningHackJs) {
        ns.tprint(`${server} is already running hack.js. Skipping...`);
        continue;
      }
    }

    ns.tprint(`Deploying to ${server}...`);
    await ns.sleep(1000);

    // Kill all processes on the server
    killAllProcesses(ns, server);

    try {
      // Copy the target script to the server
      for (const payload of payloads) {
        const copySuccess = await ns.scp(payload, server, "home");
        if (copySuccess) {
          ns.tprint(`Successfully copied ${payload} to ${server}`);
        } else {
          ns.tprint(`Failed to copy ${payload} to ${server}`);
          failedServers.push(server);
          continue; // Skip to the next server
        }
      }

      // Create the datafile and gather constants
      const datafile = await gatherConstants(ns, server, hackScript);

      await ns.scp(datafile, server, "home");

      const pid = ns.exec("hack.js", server, 1, server); // Pass targetServer as argument
      if (pid > 0) {
        ns.tprint(
          `Successfully started hack.js on ${server} targeting ${server}`
        );
      } else {
        ns.tprint(`Failed to start hack.js on ${server}`);
        failedServers.push(server);
      }
    } catch (error) {
      ns.tprint(`Error handling server ${server}: ${error}`);
      failedServers.push(server);
    }
  }
  const emptyServersData = JSON.stringify(emptyServers);
  ns.write(emptyServersFile, emptyServersData, "w");

  const failedServersData = JSON.stringify(failedServers);
  ns.write(failedServersFile, failedServersData, "w");
}

/**
 * Recursively finds all servers in the network.
 * @param {NS} ns - Netscript object
 * @param {string} [current="home"] - Current server being scanned
 * @param {Set<string>} [visited=new Set()] - Set of visited servers
 * @returns {Promise<string[]>} - List of all server hostnames
 */
async function getAllServers(
  ns: NS,
  current = "home",
  visited: Set<string> = new Set()
): Promise<string[]> {
  visited.add(current);
  const neighbors = ns.scan(current);
  for (const neighbor of neighbors) {
    if (!visited.has(neighbor)) {
      visited.add(neighbor);
      await getAllServers(ns, neighbor, visited);
    }
  }
  return Array.from(visited).filter((server) => {
    // Include only servers that are not home or private, but include srv-[d+]
    return !server.startsWith("home") && (!server.startsWith("mgmt") || server.match(/^srv-\d+$/));
  });
}

/**
 * Kills all processes running on a specified server.
 * @param {NS} ns - Netscript object
 * @param {string} server - The hostname of the server to kill all processes on
 * @returns {boolean} - True if any processes were killed, false otherwise
 */
export function killAllProcesses(ns: NS, server: string): boolean {
  const processes = ns.ps(server); // Get all running processes on the server
  if (processes.length === 0) {
    ns.tprint(`No processes running on ${server}.`);
    return false;
  }

  for (const process of processes) {
    try {
      const success = ns.kill(process.pid as unknown as string, server);

      if (success) {
        ns.tprint(
          `Killed process ${process.filename} with PID ${process.pid} on ${server}.`
        );
      } else {
        ns.tprint(
          `Failed to kill process ${process.filename} with PID ${process.pid} on ${server}.`
        );
      }
    } catch (error) {
      ns.tprint(`Unexpected error while killing processes: ${error}`);
    }
  }

  return true;
}

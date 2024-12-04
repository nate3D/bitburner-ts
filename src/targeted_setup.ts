import { NS } from "@ns";
import { gatherConstants, targetedHack, getAllServers, killAllProcesses, findBestServers } from "main";

/** Main function to deploy a script to all available servers
 * @param {NS} ns - Netscript API object
 */
export async function main(ns: NS): Promise<void> {
  if (ns.args.length < 1) {
    ns.tprint("Usage: run setup.js force=[true|false]");
    return;
  }

  const force = ns.args[0] === "true" || ns.args[0] === true;
  await findBestServers(ns);
  const top_servers = JSON.parse(ns.read("/data/top_servers.json"));
  const targetServers = top_servers.map((s: { server: string }) => s.server);
  const allServers = (await getAllServers(ns)).filter((s: string) => !s.startsWith("mgmt") || !s.startsWith("home") || !s.startsWith("srv"));
  const payloads = [
    "scripts/hack.js",
    "scripts/weaken.js",
    "scripts/grow.js",
    "logger.js",
    "hack.js",
  ];
  const servers: string[] = [];
  const emptyServers: string[] = [];
  const emptyServersFile = "/empty-servers.txt";
  const failedServers: string[] = [];
  const failedServersFile = "/failed-servers.txt";

  // Identify vulnerable servers, excluding "srv" servers and home
  for (const server of allServers) {
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
    const datafile = await gatherConstants(ns, server);
    await ns.scp(datafile, server, "home");
  }


  if (servers.length === 0) {
    ns.tprint(`No vulnerable servers found.`);
    return;
  }

  ns.tprint(
    `
    Found ${servers.length} vulnerable servers: ${servers.join(", ")}
    Targeting ${targetServers.length} servers: ${targetServers.join(", ")}
    `
  );
  await ns.sleep(5000);

  // Deploy and run scripts on the vulnerable servers
  for (const server of targetServers) {
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

    // Kill all processes on the server
    killAllProcesses(ns, server);

    try {
      // Copy the target script to the server
      for (const payload of payloads) {
        const copySuccess = ns.scp(payload, server, "home");
        if (copySuccess) {
          ns.tprint(`Successfully copied ${payload} to ${server}`);
        } else {
          ns.tprint(`Failed to copy ${payload} to ${server}`);
          failedServers.push(server);
          continue; // Skip to the next server
        }
      }

      // Create the datafile and gather constants
      const datafile = await gatherConstants(ns, server);

      ns.scp(datafile, server, "home");

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


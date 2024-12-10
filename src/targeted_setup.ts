import { NS } from "@ns";
import { logToFile } from "./logger";
import { gatherConstants, getAllServers, killAllProcesses, findBestServers } from "main";

/** Main function to deploy a script to all available servers
 * @param {NS} ns - Netscript API object
 */
export async function main(ns: NS): Promise<void> {
  if (ns.args.length < 1) {
    ns.tprint(
      `Usage: run targeted_setup.js force=[true|false] targetCount=[0:99]
       e.g. run targeted_setup.js true 20`);
    return;
  }
  const hackScript = "hack.js";

  const force = ns.args[0] === "true" || ns.args[0] === true;
  const count = Number(ns.args[1]);

  if (isNaN(count) || count < 0 || count > 99) {
    ns.tprint(`targetCount must be a number between 0 and 99`)
  }
  const jobServers = ns.getPurchasedServers().filter((s: string) => ns.serverExists(s) && !s.startsWith("mgmt") && !s.startsWith("home"));
  const hackScriptRam = ns.getScriptRam(hackScript, "home");
  await findBestServers(ns, count);
  const top_servers = JSON.parse(ns.read("/data/top_servers.json"));
  const targetServers = top_servers.map((s: { server: string }) => s.server);
  const allServers = (await getAllServers(ns)).filter((s: string) => !s.startsWith("mgmt") || !s.startsWith("home") || !s.startsWith("srv"));
  const payloads = [
    "scripts/hack.js",
    "scripts/weaken.js",
    "scripts/grow.js",
    "logger.js",
  ];
  payloads.push(hackScript);
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
    const datafile = await gatherConstants(ns, server, hackScript);
    ns.scp(datafile, server, "home");
    for (const payload of payloads) {
      ns.scp(payload, server, "home");
    }
  }

  // Copy datafiles and payloads to all job servers
  for (const jobServer of jobServers) {
    for (const server of servers) {
      ns.scp(`/data/${server}-constants.json`, jobServer, "home");
    }

    for (const payload of payloads) {
      ns.scp(payload, jobServer, "home");
    }
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

    const processes = ns.ps(server);
    const isRunningHackJs = processes.some(
      (proc) => proc.filename === hackScript
    );
    if (isRunningHackJs) {
      if (force) {
        ns.tprint(`Force flag is set, killing all processes on ${server}`);
        killAllProcesses(ns, server);
      } else {
        ns.tprint(`${server} is currently running ${hackScript}, running again...`)
      }
    }

    ns.tprint(`Deploying to ${server}...`);

    try {
      for (const jobServer of jobServers) {
        const jobServerAvailableRam = ns.getServerMaxRam(jobServer) - ns.getServerUsedRam(jobServer);
        if (jobServerAvailableRam >= hackScriptRam) {
          const pid = ns.exec(hackScript, jobServer, 1, server);
          if (pid > 0) {
            ns.tprint(
              `Successfully started ${hackScript} on ${jobServer} targeting ${server}`
            );
            break;
          } else {
            ns.tprint(`Failed to start ${hackScript} on ${jobServer} targeting ${server}`);
          }
        }
      }

      const sleepTime = 500;
      ns.tprint(`Sleeping ${sleepTime / 1000} seconds between starts...`)
      await ns.sleep(sleepTime)
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



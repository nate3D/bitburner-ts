import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  const iterations = ns.args[0] as number || 1;
  const initFile = "/data/init_complete.txt";
  const hackScript = "formulas_hack.js";

  // Check if initialization file exists
  if (ns.fileExists(initFile, "home")) {
    ns.tprint("Initialization already completed. Exiting...");
    return;
  }

  ns.tprint("Starting initialization process...");

  // Perform your initialization logic
  await performInitialization(ns, iterations, hackScript);

  // Mark initialization as complete
  ns.write(initFile, "Initialization complete", "w");
}


async function performInitialization(ns: NS, iterations: number, hackScript: string): Promise<void> {
  const scriptToRun = "targeted_setup.js";
  const ipvgoScript = "ipvgo_v2.js";
  const autoTraderScript = "autoTrader.js";
  const mgmtSrv = "mgmt-A";
  const mgmtRam = 128;
  let mgmtOwned = ns.serverExists(mgmtSrv);
  let targetCount = 100;

  ns.tprint("Purchasing servers...");
  const maxServers: number = ns.getPurchasedServerLimit();
  const serverCost = ns.getPurchasedServerCost(mgmtRam);

  // Purchase job servers
  while (ns.getPurchasedServers().length < maxServers - 1) {
    await purchaseServers(ns, maxServers);
    await ns.sleep(1000); // Add delay to avoid infinite loop
  }

  // Check if there's enough money to purchase the management server
  while (!mgmtOwned) {
    const availableMoney = ns.getServerMoneyAvailable("home"); // Update money each iteration

    if (availableMoney >= serverCost) {
      const hostname = ns.purchaseServer(mgmtSrv, mgmtRam);
      if (hostname) {
        ns.tprint(`Purchased management server "${hostname}" for $${serverCost.toLocaleString()}`);
        mgmtOwned = true;

        ns.tprint(`Running misc scripts on ${mgmtSrv}...`);
        ns.scp(ipvgoScript, mgmtSrv);
        ns.scp(autoTraderScript, mgmtSrv);
        ns.exec(ipvgoScript, mgmtSrv, 1);
        ns.exec(autoTraderScript, mgmtSrv, 1);
      } else {
        ns.tprint(`Failed to purchase server.`);
      }
    } else {
      ns.print(`Insufficient funds: $${availableMoney.toLocaleString()} / $${serverCost.toLocaleString()}`);
    }
    await ns.sleep(5000); // Avoid locking up with too frequent checks
  }

  // Execute targeted_setup.js with specified arguments
  ns.tprint(`Running ${scriptToRun} with targetCount=${targetCount} for ${iterations} iterations...`);
  for (let i = 0; i < iterations; i++) {
    ns.tprint(`Iteration ${i + 1} of ${iterations}`);
    const pid = ns.exec(scriptToRun, "home", 1, false, targetCount);
    if (pid > 0) {
      ns.tprint(`Successfully started ${scriptToRun} with PID ${pid}.`);
    } else {
      ns.tprint(`Failed to start ${scriptToRun}. Check your script or system resources.`);
    }
    await ns.sleep(5000); // Sleep between iterations
  }
}

export async function gatherConstants(ns: NS, target: string, hackScript: string, host?: string): Promise<string> {
  const hostname = host || ns.getHostname();
  const targetname = target || ns.getHostname();
  const datafile = `data/${targetname}-constants.json`;

  const serverMaxMoney = ns.getServerMaxMoney(targetname);
  const serverMoneyAvailable = ns.getServerMoneyAvailable(targetname);
  const serverMaxRam = ns.getServerMaxRam(targetname);
  const serverMinSecurityLvl = ns.getServerMinSecurityLevel(targetname);
  const serverGrowthRate = ns.getServerGrowth(targetname);
  const hostInfo = ns.getServer(hostname);
  const targetInfo = ns.getServer(targetname);
  const coreCount = hostInfo.cpuCores;
  const hackChance = ns.hackAnalyzeChance(targetname);
  const hackPerThread = ns.hackAnalyze(targetname);
  const hackAnalyzeChance = ns.hackAnalyzeChance(targetname);
  const growthSecurityIncrease = ns.growthAnalyzeSecurity(1, targetname, coreCount);
  const hackTime = ns.getHackTime(targetname);
  const growTime = ns.getGrowTime(targetname);
  const weakenTime = ns.getWeakenTime(targetname);
  const weakenEffect = ns.weakenAnalyze(1, coreCount);
  const hackingLevel = ns.getHackingLevel();
  const purchasedServers = ns.getPurchasedServers();
  const hackableServers = (await getAllServers(ns)).filter((s) =>
    ns.getServerRequiredHackingLevel(s) <= hackingLevel &&
    !s.startsWith("home") &&
    !s.startsWith("srv") &&
    !s.startsWith("mgmt") &&
    ns.hasRootAccess(s));
  const scriptRam = ns.getScriptRam(hackScript, "home");
  const weakenRam = ns.getScriptRam("scripts/weaken.js", "home");
  const hackRam = ns.getScriptRam("scripts/hack.js", "home");
  const growRam = ns.getScriptRam("scripts/grow.js", "home");

  const constants = {
    hostname: hostname,
    targetname: targetname,
    maxMoney: serverMaxMoney,
    moneyAvailable: serverMoneyAvailable,
    maxRam: serverMaxRam,
    minSecurity: serverMinSecurityLvl,
    growthRate: serverGrowthRate,
    growthSecurityIncrease: growthSecurityIncrease,
    coreCount: coreCount,
    hackChance: hackChance,
    hackPerThread: hackPerThread,
    hackAnalyzeChance: hackAnalyzeChance,
    hackTime: hackTime,
    growTime: growTime,
    weakenTime: weakenTime,
    weakenEffect: weakenEffect,
    scriptRam: scriptRam,
    hackingLevel: hackingLevel,
    hostInfo: hostInfo,
    targetInfo: targetInfo,
    purchasedServers: purchasedServers,
    hackableServers: hackableServers,
    weakenRam: weakenRam,
    hackRam: hackRam,
    growRam: growRam,
  };
  ns.write(datafile, JSON.stringify(constants), "w");
  ns.print(`Wrote constants to ${datafile}`);

  return datafile;
}

/**
 * Recursively finds all servers in the network.
 * @param ns - Netscript object
 * @param current - Current server being scanned
 * @param visited - Set of visited servers
 * @returns - List of all server hostnames
 */
export async function getAllServers(
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
  return Array.from(visited);
}


/**
 * Finds the best servers to hack based on max money and hack time.
 * @param ns - Netscript object provided by Bitburner.
 */
export async function findBestServers(ns: NS, count: number = 1): Promise<void> {
  const allServers = await getAllServers(ns);
  const hackableServers = [];

  const playerHackingLevel = ns.getHackingLevel();

  ns.tprint(`Finding the best servers (${allServers.length} found) to hack for hacking level ${playerHackingLevel}...`);

  for (const server of allServers) {
    const serverHackingLevel = ns.getServerRequiredHackingLevel(server);

    // Filter servers that you can hack
    if (
      ns.hasRootAccess(server) &&
      serverHackingLevel <= playerHackingLevel &&
      ns.getServerMaxMoney(server) > 0
    ) {
      hackableServers.push(server);
    }
  }

  // Evaluate servers based on max money and hack time
  const serverRatings = hackableServers.map((server) => {
    const maxMoney = ns.getServerMaxMoney(server);
    const hackTime = ns.getHackTime(server);
    const score = maxMoney / hackTime; // You can adjust this formula as needed

    return { server, score, maxMoney, hackTime };
  });

  // Sort servers by their score in descending order
  serverRatings.sort((a, b) => b.score - a.score);

  // Get the top servers
  const topServers = serverRatings.slice(0, count);

  const top_servers_file = `/data/top_servers.json`;
  ns.write(top_servers_file, JSON.stringify(topServers), "w");
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

export async function killHackProcesses(ns: NS, hackScript: string): Promise<void> {
  // Get all servers in the network
  const allServers = await getAllServers(ns);

  for (const server of allServers) {
    // Get all running processes on the server
    const processes = ns.ps(server);

    // Filter processes that match our hacking scripts
    const hackProcesses = processes.filter(proc =>
      proc.filename === hackScript ||
      proc.filename === "scripts/hack.js" ||
      proc.filename === "scripts/grow.js" ||
      proc.filename === "scripts/weaken.js");

    if (hackProcesses.length > 0) {
      ns.tprint(`Found ${hackProcesses.length} instance(s) of hacking scripts running on ${server}. Killing...`);

      for (const proc of hackProcesses) {
        if (ns.kill(proc.pid)) {
          ns.tprint(`Successfully killed hacks with PID ${proc.pid} on ${server}.`);
        } else {
          ns.tprint(`Failed to kill hacks with PID ${proc.pid} on ${server}.`);
        }
      }
    } else {
      ns.print(`No hack processes found on ${server}.`);
    }
  }

  ns.tprint("Completed killing hack processes on all servers.");
}

export async function purchaseServers(ns: NS, maxServers: number): Promise<void> {
  const ram = 512; // RAM for each purchased server
  const delay = 1000; // Delay (ms) between checks

  // Cache server costs
  const serverCost = ns.getPurchasedServerCost(ram);

  // Check if already at max servers
  const purchasedServers = ns.getPurchasedServers();
  if (purchasedServers.length >= maxServers - 1) {
    ns.tprint("Maximum number of servers already purchased.");
    return;
  }

  let i = purchasedServers.length;
  while (i < maxServers - 1) {
    const availableMoney = ns.getServerMoneyAvailable("home");

    if (availableMoney >= serverCost) {
      const hostname = ns.purchaseServer(`srv-${i}`, ram);
      if (hostname) {
        ns.tprint(`Purchased server "${hostname}" for $${serverCost.toLocaleString()}`);
        i++;
      } else {
        ns.tprint(`Failed to purchase server. Retrying...`);
      }
    } else {
      ns.print(`Insufficient funds: $${availableMoney.toLocaleString()} / $${serverCost.toLocaleString()}`);
    }
    await ns.sleep(delay); // Avoid infinite loop by sleeping between checks
  }

  ns.tprint("All servers purchased or maximum limit reached.");
}

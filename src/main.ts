import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  const initFile = "/data/init_complete.txt";
  // Check if initialization file exists
  if (ns.fileExists(initFile, "home")) {
    ns.tprint("Initialization already completed. Exiting...");
    return;
  }

  ns.tprint("Starting initialization process...");

  // Perform your initialization logic
  await performInitialization(ns);

  // Mark initialization as complete
  ns.write(initFile, "Initialization complete", "w");
}

async function performInitialization(ns: NS): Promise<void> {
  const interval = 100; // Trigger action every 100 levels
  const scriptToRun = "targeted_setup.js";
  const ipvgoScript = "ipvgo_v2.js"
  let ipvgoPid = 0;
  const mgmtSrv = "mgmt-A";
  const mgmtRam = 128;
  let mgmtOwned = ns.serverExists(mgmtSrv);
  let lastCheckedLevel = ns.getHackingLevel(); // Store initial hacking level
  const currentLevel = ns.getHackingLevel();
  let targetCount = getDynamicTargetCount(currentLevel);

  // Kill all hack.js processes
  await killHackProcesses(ns);

  // Execute targeted_setup.js with specified arguments
  const pid = ns.exec(scriptToRun, "home", 1, true, targetCount);
  if (pid > 0) {
    ns.tprint(`Successfully started ${scriptToRun} with PID ${pid}.`);
  } else {
    ns.tprint(`Failed to start ${scriptToRun}. Check your script or system resources.`);
  }

  ns.tprint("Starting main loop...");
  while (true) {
    // Cache server limits and costs
    const serverCost = ns.getPurchasedServerCost(mgmtRam);
    const availableMoney = ns.getServerMoneyAvailable("home");

    // Check if there's enough money to purchase a server
    if (!mgmtOwned) {
      if (availableMoney >= serverCost) {
        const hostname = ns.purchaseServer(mgmtSrv, mgmtRam);

        if (hostname) {
          ns.tprint(`Purchased server "${hostname}" for $${serverCost.toLocaleString()}`);
          mgmtOwned = true;
        } else {
          ns.tprint(`Failed to purchase server.`);
        }
      } else {
        ns.print(`Insufficient funds: $${availableMoney.toLocaleString()} / $${serverCost.toLocaleString()}`);
      }
    } else {
      // If mgmt-A is available, run the IPvGo script
      if (mgmtOwned && ipvgoPid === 0) {
        ns.tprint(`Running IPvGO script on ${mgmtSrv}...`);
        ns.scp(ipvgoScript, mgmtSrv);
        ipvgoPid = ns.exec(ipvgoScript, mgmtSrv, 1);
        if (ipvgoPid > 0) {
          ns.tprint(`Successfully started ${ipvgoScript} with PID ${ipvgoPid}.`);
        } else {
          ns.tprint(`Failed to start ${ipvgoScript}. Check your script or system resources.`);
        }
      }
    }

    // Check if the hacking level has increased by the interval
    if (currentLevel >= lastCheckedLevel + interval) {
      ns.tprint(`Hacking level increased to ${currentLevel}. Triggering actions...`);
      targetCount = getDynamicTargetCount(currentLevel);

      // Execute targeted_setup.js with specified arguments
      const pid = ns.exec(scriptToRun, "home", 1, true, targetCount);
      if (pid > 0) {
        ns.tprint(`Successfully started ${scriptToRun} with PID ${pid}.`);
      } else {
        ns.tprint(`Failed to start ${scriptToRun}. Check your script or system resources.`);
      }

      // Update the last checked level
      lastCheckedLevel = currentLevel;
    }

    // Wait for a short interval before checking again
    await ns.sleep(10000);
  }
}

function getDynamicTargetCount(currentLevel: number, minTarget = 10, maxTarget = 99, maxLevel = 1000): number {
  if (currentLevel >= maxLevel) {
    return maxTarget; // Cap at maxTarget if level exceeds maxLevel
  }
  return Math.round(minTarget + ((maxTarget - minTarget) / maxLevel) * currentLevel);
}


export async function gatherConstants(ns: NS, target: string, host?: string): Promise<string> {
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
  const scriptRam = ns.getScriptRam("hack.js", "home");
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

export async function targetedHack(ns: NS): Promise<void> {
  const top_servers_file = `/data/top_servers.json`;
  const topServers = JSON.parse(await ns.read(top_servers_file));
  const hack_script = "hack.js";

  for (const { server } of topServers) {
    ns.tprint(`Attempting to hack ${server}...`);
    ns.scp(hack_script, server);
    const pid = ns.exec(hack_script, server, 1, server);
    if (pid > 0) {
      ns.tprint(`Successfully started hack.js on ${server} targeting ${server}`);
    } else {
      ns.tprint(`Failed to start hack.js on ${server}`);
    }
  }
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

export async function killHackProcesses(ns: NS): Promise<void> {
  // Get all servers in the network
  const allServers = await getAllServers(ns);

  for (const server of allServers) {
    // Get all running processes on the server
    const processes = ns.ps(server);

    // Filter processes that match 'hack.js'
    const hackProcesses = processes.filter(proc =>
      proc.filename === "hack.js" ||
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

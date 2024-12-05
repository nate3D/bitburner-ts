import { NS } from "@ns";
import { logToFile } from "logger";

export async function main(ns: NS): Promise<void> {
  const target = ns.args[0] as string;
  if (!target) {
    logToFile(ns, "ERROR: Target server not specified.");
    return;
  }

  const datafile = `data/${target}-constants.json`;

  // Read constants from the datafile
  const dataContent = ns.read(datafile);
  if (!dataContent) {
    logToFile(ns, `ERROR: Data file ${datafile} is empty or does not exist.`);
    return;
  }

  const constants = JSON.parse(dataContent);
  if (!constants) {
    logToFile(ns, `ERROR: Could not parse constants from ${datafile}.`);
    return;
  }

  const {
    maxMoney,
    minSecurity,
    growthSecurityIncrease,
    weakenEffect,
    coreCount,
    purchasedServers,
    weakenRam,
    hackRam,
    growRam,
    hackableServers,
  } = constants;

  const scriptDir = "scripts/";
  const weakenScript = `${scriptDir}weaken.js`;
  const hackScript = `${scriptDir}hack.js`;
  const growScript = `${scriptDir}grow.js`;

  const serverMoneyThreshold = maxMoney * 0.75; // Hack until the server has at least 75% of max money
  const serverSecurityThreshold = minSecurity + 5; // Keep security level close to minimum

  while (true) {
    const currentSecurity = ns.getServerSecurityLevel(target);
    const currentMoney = ns.getServerMoneyAvailable(target);

    // Helper function to execute scripts on the most suitable server
    const runOnBestServer = async (
      ns: NS,
      script: string,
      threads: number,
      args: (string | number)[],
      ramCost: number
    ): Promise<number> => {
      const jobServers = purchasedServers.filter((s: string) => ns.serverExists(s) && !s.startsWith("mgmt") && !s.startsWith("home"));
      const allServers = ["home", target, ...jobServers, ...hackableServers]; // Use purchased servers and home

      let remainingThreads = threads; // Threads that still need to be allocated
      let totalStartedThreads = 0; // Keep track of successfully started threads

      for (const server of allServers) {
        if (remainingThreads <= 0) break; // Stop if all threads have been allocated

        let availableRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);

        let maxThreads = Math.floor(availableRam / ramCost);

        if (maxThreads > 0) {
          // Determine how many threads can be run on this server
          let runnableThreads = Math.min(remainingThreads, maxThreads);

          // Copy the script to the server if not already there
          await ns.scp(script, server);

          const pid = ns.exec(script, server, runnableThreads, ...args);
          if (pid > 0) {
            logToFile(
              ns,
              `Started ${script} on ${server} with ${runnableThreads}/${threads} threads.`
            );
            totalStartedThreads += runnableThreads;
            remainingThreads -= runnableThreads;
          } else {
            logToFile(
              ns,
              `Failed to start ${script} on ${server} despite sufficient RAM.`
            );
          }
        } else {
          logToFile(
            ns,
            `Insufficient RAM on ${server} for ${script}. Needed per thread: ${ramCost}, Available: ${availableRam}`
          );
        }
      }

      if (totalStartedThreads === 0) {
        logToFile(
          ns,
          `ERROR: Could not allocate any threads for ${script}. Operation skipped due to insufficient resources.`
        );
      } else if (remainingThreads > 0) {
        logToFile(
          ns,
          `WARNING: Only allocated ${totalStartedThreads}/${threads} threads for ${script} due to resource constraints.`
        );
      }

      return totalStartedThreads; // Return the total number of threads successfully started
    };

    // Determine batching operations
    if (currentSecurity > serverSecurityThreshold) {
      // Weaken logic
      const weakenThreadsNeeded = Math.ceil((currentSecurity - minSecurity) / weakenEffect);
      const availableWeakenThreads = await getMaxAvailableThreads(ns, weakenRam);

      const weakenThreads = Math.min(weakenThreadsNeeded, availableWeakenThreads);
      if (weakenThreads <= 0) {
        logToFile(ns, `ERROR: Not enough RAM to run weaken on any server.`);
      } else {
        const weakenStarted = await runOnBestServer(ns, weakenScript, weakenThreads, [target], weakenRam);
        if (weakenStarted < weakenThreadsNeeded) {
          logToFile(ns, `Weaken started with ${weakenStarted}/${weakenThreadsNeeded} threads.`);
        }
      }
    } else if (currentMoney < serverMoneyThreshold) {
      // Grow and weaken logic
      const growMultiplier = maxMoney / Math.max(currentMoney, 1); // Avoid division by zero
      let growThreadsNeeded = Math.ceil(ns.growthAnalyze(target, growMultiplier, coreCount));

      // Limit growThreadsNeeded to available resources
      const availableGrowThreads = await getMaxAvailableThreads(ns, growRam);
      growThreadsNeeded = Math.min(growThreadsNeeded, availableGrowThreads);

      if (growThreadsNeeded <= 0) {
        logToFile(ns, `ERROR: Not enough RAM to run grow on any server.`);
      } else {
        const securityIncrease = growThreadsNeeded * growthSecurityIncrease;
        const weakenThreadsNeeded = Math.ceil(securityIncrease / weakenEffect);
        const availableWeakenThreads = await getMaxAvailableThreads(ns, weakenRam);

        const weakenThreads = Math.min(weakenThreadsNeeded, availableWeakenThreads);

        const growStarted = await runOnBestServer(ns, growScript, growThreadsNeeded, [target], growRam);
        if (growStarted < growThreadsNeeded) {
          logToFile(ns, `Grow started with ${growStarted}/${growThreadsNeeded} threads.`);
        }

        if (weakenThreads <= 0) {
          logToFile(ns, `ERROR: Not enough RAM to run weaken after grow on any server.`);
        } else {
          const weakenStarted = await runOnBestServer(ns, weakenScript, weakenThreads, [target], weakenRam);
          if (weakenStarted < weakenThreadsNeeded) {
            logToFile(ns, `Weaken after grow started with ${weakenStarted}/${weakenThreadsNeeded} threads.`);
          }
        }
      }
    } else {
      // Hack and weaken logic
      const hackFraction = ns.hackAnalyze(target);
      if (hackFraction <= 0) {
        logToFile(ns, `Cannot hack ${target}; hackAnalyze returned ${hackFraction}.`);
        await ns.sleep(1000);
        continue;
      }

      const desiredHackFraction = 0.25; // Hack 25% of money
      let hackThreadsNeeded = Math.floor(desiredHackFraction / hackFraction);

      // Limit hackThreadsNeeded to available resources
      const availableHackThreads = await getMaxAvailableThreads(ns, hackRam);
      hackThreadsNeeded = Math.min(hackThreadsNeeded, availableHackThreads);

      if (hackThreadsNeeded <= 0) {
        logToFile(ns, `ERROR: Not enough RAM to run hack on any server.`);
      } else {
        const securityIncrease = hackThreadsNeeded * 0.002; // Typical hack security increase per thread
        const weakenThreadsNeeded = Math.ceil(securityIncrease / weakenEffect);
        const availableWeakenThreads = await getMaxAvailableThreads(ns, weakenRam);

        const weakenThreads = Math.min(weakenThreadsNeeded, availableWeakenThreads);

        const hackStarted = await runOnBestServer(ns, hackScript, hackThreadsNeeded, [target], hackRam);
        if (hackStarted < hackThreadsNeeded) {
          logToFile(ns, `Hack started with ${hackStarted}/${hackThreadsNeeded} threads.`);
        }

        if (weakenThreads <= 0) {
          logToFile(ns, `ERROR: Not enough RAM to run weaken after hack on any server.`);
        } else {
          const weakenStarted = await runOnBestServer(ns, weakenScript, weakenThreads, [target], weakenRam);
          if (weakenStarted < weakenThreadsNeeded) {
            logToFile(ns, `Weaken after hack started with ${weakenStarted}/${weakenThreadsNeeded} threads.`);
          }
        }
      }
    }

    // Wait for the longest action to complete
    const hackTime = ns.getHackTime(target);
    const growTime = ns.getGrowTime(target);
    const weakenTime = ns.getWeakenTime(target);

    const sleepTime = Math.max(hackTime, growTime, weakenTime) + 200;
    await ns.sleep(sleepTime);
  }

  // Helper function to calculate the maximum available threads for a given RAM cost
  async function getMaxAvailableThreads(ns: NS, ramCost: number): Promise<number> {
    const jobServers = purchasedServers.filter((s: string) => ns.serverExists(s));
    const allServers = [...jobServers, "home"];

    let totalAvailableThreads = 0;

    for (const server of allServers) {
      let availableRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
      let maxThreads = Math.floor(availableRam / ramCost);
      if (maxThreads > 0) {
        totalAvailableThreads += maxThreads;
      }
    }
    return totalAvailableThreads;
  }
}

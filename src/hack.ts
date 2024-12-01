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
  const constants = JSON.parse(await ns.read(datafile));
  if (!constants) {
    logToFile(ns, `ERROR: Could not read constants file ${datafile}.`);
    return;
  }

  const {
    maxMoney,
    minSecurity,
    growthSecurityIncrease,
    hackPerThread,
    weakenEffect,
    coreCount,
    hackTime,
    growTime,
    weakenTime,
  } = constants;


  const scriptDir = "scripts/";
  const weakenScript = `${scriptDir}weaken.js`;
  const hackScript = `${scriptDir}hack.js`;
  const growScript = `${scriptDir}grow.js`;

  const weakenRam = ns.getScriptRam(weakenScript, "home");
  const hackRam = ns.getScriptRam(hackScript, "home");
  const growRam = ns.getScriptRam(growScript, "home");

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
      const allServers = [ns.getHostname(), "home"];
      for (const server of allServers) {
        let availableRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
        let maxThreads = Math.floor(availableRam / ramCost);

        if (maxThreads > 0) {
          // Limit threads to either the requested number or maximum possible
          let runnableThreads = Math.min(threads, maxThreads);
          const pid = ns.exec(script, server, runnableThreads, ...args);
          if (pid > 0) {
            logToFile(ns,
              `Started ${script} on ${server} with ${runnableThreads}/${threads} threads.`
            );
            return runnableThreads; // Return the number of threads actually started
          } else {
            logToFile(ns,
              `Failed to start ${script} on ${server} despite sufficient RAM.`
            );
          }
        } else {
          logToFile(ns,
            `Insufficient RAM on ${server} for ${script}. Needed: ${threads * ramCost
            }, Available: ${availableRam}`
          );
        }
      }
      return 0; // Return 0 threads if unable to start
    };

    // Determine batching operations
    if (currentSecurity > serverSecurityThreshold) {
      // Weaken logic
      const weakenThreads = Math.ceil((currentSecurity - minSecurity) / weakenEffect);
      const weakenStarted = await runOnBestServer(ns, weakenScript, weakenThreads, [target], weakenRam);
      if (weakenStarted < weakenThreads) {
        logToFile(ns, `Weaken started partially: ${weakenStarted}/${weakenThreads} threads.`);
      }
    } else if (currentMoney < serverMoneyThreshold) {
      // Grow and weaken logic
      const growMultiplier = maxMoney / Math.max(currentMoney, 1);
      const growThreads = Math.ceil(ns.growthAnalyze(target, growMultiplier, coreCount));
      const securityIncrease = growThreads * growthSecurityIncrease;
      const weakenThreads = Math.ceil(securityIncrease / weakenEffect);

      const growStarted = await runOnBestServer(ns, growScript, growThreads, [target], growRam);
      if (growStarted < growThreads) {
        logToFile(ns, `Grow started partially: ${growStarted}/${growThreads} threads.`);
      }

      const weakenStarted = await runOnBestServer(ns, weakenScript, weakenThreads, [target], weakenRam);
      if (weakenStarted < weakenThreads) {
        logToFile(ns, `Weaken after grow started partially: ${weakenStarted}/${weakenThreads} threads.`);
      }
    } else {
      // Hack and weaken logic
      const hackAmount = currentMoney * 0.25; // Hack 25% of available money
      const hackThreads = Math.floor(hackAmount / (hackPerThread * maxMoney));
      const securityIncrease = hackThreads * 0.002; // Typical hack security increase per thread
      const weakenThreads = Math.ceil(securityIncrease / weakenEffect);

      const hackStarted = await runOnBestServer(ns, hackScript, hackThreads, [target], hackRam);
      if (hackStarted < hackThreads) {
        logToFile(ns, `Hack started partially: ${hackStarted}/${hackThreads} threads.`);
      }

      const weakenStarted = await runOnBestServer(ns, weakenScript, weakenThreads, [target], weakenRam);
      if (weakenStarted < weakenThreads) {
        logToFile(ns, `Weaken after hack started partially: ${weakenStarted}/${weakenThreads} threads.`);
      }
    }

    // Wait for the longest action to complete
    const maxDelay = Math.max(weakenTime, growTime, hackTime);
    await ns.sleep(maxDelay + 200);
  }
}


import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  const target = ns.args[0] as string;
  if (!target) {
    ns.print("ERROR: Target server not specified.");
    return;
  }

  const datafile = `data/${target}-constants.json`;

  // Read constants from the datafile
  const dataContent = ns.read(datafile);
  if (!dataContent) {
    ns.print(`ERROR: Data file ${datafile} is empty or does not exist.`);
    return;
  }

  const constants = JSON.parse(dataContent);
  if (!constants) {
    ns.print(`ERROR: Could not parse constants from ${datafile}.`);
    return;
  }

  const {
    targetInfo,
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

  const player = ns.getPlayer();

  const {
    minDifficulty: minSecurity = -1,
    moneyMax: maxMoney = -1,
  } = targetInfo;

  const weakenEffect = ns.weakenAnalyze(1);
  const serverMoneyThreshold = maxMoney * 0.75;
  const serverSecurityThreshold = minSecurity + 5;

  const ramCosts = {
    weaken: weakenRam,
    hack: hackRam,
    grow: growRam,
  };

  while (true) {
    const actions = [];

    const currentSecurity = ns.getServerSecurityLevel(target);
    const currentMoney = ns.getServerMoneyAvailable(target);

    if (currentSecurity > serverSecurityThreshold) {
      // Calculate weaken threads required
      const weakenThreadsNeeded = Math.ceil(
        (currentSecurity - minSecurity) / weakenEffect
      );
      actions.push({
        script: weakenScript,
        threads: weakenThreadsNeeded,
        args: [target],
        ramCost: ramCosts.weaken,
      });
    } else if (currentMoney < serverMoneyThreshold) {
      // Calculate grow threads required
      const growMultiplier = maxMoney / Math.max(currentMoney, 1);
      const growThreadsNeeded = Math.ceil(
        ns.formulas.hacking.growThreads(targetInfo, player, growMultiplier)
      );

      const securityIncrease = ns.growthAnalyzeSecurity(
        growThreadsNeeded,
        targetInfo.hostname,
      );
      const weakenThreadsNeeded = Math.ceil(securityIncrease / weakenEffect);

      actions.push(
        {
          script: growScript,
          threads: growThreadsNeeded,
          args: [target],
          ramCost: ramCosts.grow,
        },
        {
          script: weakenScript,
          threads: weakenThreadsNeeded,
          args: [target],
          ramCost: ramCosts.weaken,
        }
      );
    } else {
      // Calculate hack threads required
      const hackFraction = 0.25; // Hack 25% of available money
      const hackThreadsNeeded = Math.ceil(
        hackFraction / ns.hackAnalyze(target)
      );

      const securityIncrease = ns.hackAnalyzeSecurity(
        hackThreadsNeeded,
        targetInfo.hostname,
      );
      const weakenThreadsNeeded = Math.ceil(securityIncrease / weakenEffect);

      actions.push(
        {
          script: hackScript,
          threads: hackThreadsNeeded,
          args: [target],
          ramCost: ramCosts.hack,
        },
        {
          script: weakenScript,
          threads: weakenThreadsNeeded,
          args: [target],
          ramCost: ramCosts.weaken,
        }
      );
    }

    // Distribute tasks across servers
    for (const action of actions) {
      let remainingThreads = action.threads;

      while (remainingThreads > 0) {
        const batchThreads = remainingThreads;

        await runOnBestServer(
          ns,
          action.script,
          remainingThreads,
          action.args,
          action.ramCost,
          purchasedServers,
          hackableServers,
          target
        );

        remainingThreads -= batchThreads;
      }
    }

    // Dynamically calculate sleep time for next iteration
    const nextSleepTime = Math.min(
      ns.getWeakenTime(target),
      ns.getGrowTime(target),
      ns.getHackTime(target)
    );

    await ns.sleep(nextSleepTime / 2); // Shorter sleep cycles allow more frequent task runs
  }
}


export async function runOnBestServer(
  ns: NS,
  script: string,
  threads: number,
  args: (string | number)[],
  ramCost: number,
  purchasedServers: string[],
  hackableServers: string[],
  target: string
): Promise<number> {
  const jobServers = purchasedServers.filter(
    (s: string) =>
      ns.serverExists(s) && !s.startsWith("mgmt") && !s.startsWith("home")
  );
  const allServers = ["home", target, ...jobServers, ...hackableServers]; // Use purchased servers and home

  let totalStartedThreads = 0; // Keep track of successfully started threads

  for (const server of allServers) {
    if (threads <= 0) break; // Stop if all threads have been allocated

    const availableRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
    const maxThreads = Math.floor(availableRam / ramCost);

    if (maxThreads > 0) {
      // Determine how many threads can be run on this server
      const runnableThreads = Math.min(threads, maxThreads);

      // Copy the script to the server if not already there
      await ns.scp(script, server);

      const pid = ns.exec(script, server, runnableThreads, ...args);
      if (pid > 0) {
        ns.print(
          `Started ${script} on ${server} with ${runnableThreads}/${threads} threads.`
        );
        totalStartedThreads += runnableThreads;
        threads -= runnableThreads;
      } else {
        ns.print(
          `Failed to start ${script} on ${server} despite sufficient RAM.`
        );
      }
    } else {
      ns.print(
        `Insufficient RAM on ${server} for ${script}. Needed per thread: ${ramCost}, Available: ${availableRam}`
      );
    }
  }

  if (totalStartedThreads === 0) {
    ns.print(
      `ERROR: Could not allocate any threads for ${script}. Operation skipped due to insufficient resources.`
    );
  } else if (threads > 0) {
    ns.print(
      `WARNING: Only allocated ${totalStartedThreads}/${threads} threads for ${script} due to resource constraints.`
    );
  }

  return totalStartedThreads; // Return the total number of threads successfully started
}
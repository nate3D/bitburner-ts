import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  const target = ns.args[0] as string;
  if (!target) {
    ns.tprint("ERROR: Target server not specified.");
    return;
  }

  const datafile = `data/${target}-constants.json`;

  // Read constants from the datafile
  const dataContent = ns.read(datafile);
  if (!dataContent) {
    ns.tprint(`ERROR: Data file ${datafile} is empty or does not exist.`);
    return;
  }

  const constants = JSON.parse(dataContent);
  if (!constants) {
    ns.tprint(`ERROR: Could not parse constants from ${datafile}.`);
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

  const hackFraction = 0.25; // Hack 25% of server money per batch
  const batchDelay = 200;    // Time (ms) between launching new batches
  const delayBetweenSteps = 50; // Delay between steps in a single batch

  while (true) {
    const currentSecurity = ns.getServerSecurityLevel(target);
    const minSecurity = ns.getServerMinSecurityLevel(target);
    const currentMoney = ns.getServerMoneyAvailable(target);
    const maxMoney = ns.getServerMaxMoney(target);

    ns.print(`
      Current security: ${currentSecurity}
      Min security: ${minSecurity}
      Current money: ${currentMoney}
      Max money: ${maxMoney}`
    );

    const serverSecurityThreshold = minSecurity + 5;
    const serverMoneyThreshold = maxMoney * 0.75;
    const weakenEffect = ns.weakenAnalyze(1);

    // Calculate the needed threads for this batch:
    let weakenThreads1 = 0;
    let growThreads = 0;
    let weakenThreads2 = 0;
    let hackThreads = 0;

    if (currentSecurity > serverSecurityThreshold) {
      // If security is too high, dedicate batch to lowering it
      ns.print(`Security is too high on ${target}. Weakening security.`);
      weakenThreads1 = Math.ceil((currentSecurity - minSecurity) / weakenEffect);

    } else if (currentMoney < serverMoneyThreshold) {
      // If money is low, grow it
      ns.print(`Money is low on ${target}. Growing money.`);
      const growMultiplier = maxMoney / Math.max(currentMoney, 1);
      const desiredFinalMoney = currentMoney * growMultiplier;

      // Calculate growThreads using growthAnalyze: needed multiplier = desiredFinalMoney/currentMoney
      const neededMultiplier = desiredFinalMoney / Math.max(currentMoney, 1);
      growThreads = Math.ceil(ns.growthAnalyze(target, neededMultiplier));

      const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, target);
      // weakenThreads1 = Math.ceil(growSecurityIncrease / weakenEffect);
      ns.print(`Growing money on ${target} by ${growMultiplier}x with ${growThreads} threads resulting in ${growSecurityIncrease} security increase.`);

    } else {
      // Otherwise, hack a fraction of the server's money
      ns.print(`Hacking ${hackFraction * 100}% of money on ${target}.`);
      const hackAnalyzeResult = ns.hackAnalyze(target);
      if (hackAnalyzeResult > 0) {
        hackThreads = Math.ceil(hackFraction / hackAnalyzeResult);
      } else {
        // If hackAnalyze returns 0, means too low skill or server not hackable yet
        ns.print(`Unable to hack ${target}, hackAnalyze returned 0.`);
        hackThreads = 0;
      }

      // After hacking, determine how many grow threads are needed to restore money
      const postHackMoney = currentMoney - (currentMoney * hackFraction);
      const growMultiplier = maxMoney / Math.max(postHackMoney, 1);
      const desiredFinalMoney = postHackMoney * growMultiplier;

      // neededMultiplier for grow = desiredFinalMoney / postHackMoney
      const neededMultiplier = desiredFinalMoney / Math.max(postHackMoney, 1);
      growThreads = Math.ceil(ns.growthAnalyze(target, neededMultiplier));

      const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, target);

      // We'll do two weakens: one before grow to ensure low security, and one after grow
      let preWeakenNeeded = 0;
      if (currentSecurity > minSecurity) {
        preWeakenNeeded = Math.ceil((currentSecurity - minSecurity) / weakenEffect);
      }

      weakenThreads2 = Math.ceil(growSecurityIncrease / weakenEffect);
      weakenThreads1 = preWeakenNeeded;
    }

    // Launch a batch (if we have something to do)
    if (weakenThreads1 === 0 && growThreads === 0 && weakenThreads2 === 0 && hackThreads === 0) {
      ns.print(`Nothing to do on ${target}. Sleeping.`);
      ns.print(
        `Weaken #1: ${weakenThreads1}
        Grow: ${growThreads}
        Weaken #2: ${weakenThreads2}
        Hack: ${hackThreads}
        `
      );
      await ns.sleep(500);
      continue;
    }

    // Launch order:
    // Weaken #1 -> (delayBetweenSteps) -> Grow -> (delayBetweenSteps) -> Weaken #2 -> (delayBetweenSteps) -> Hack

    if (weakenThreads1 > 0) {
      await runOnBestServer(ns, weakenScript, weakenThreads1, [target], weakenRam, purchasedServers, hackableServers, target);
    }
    await ns.sleep(delayBetweenSteps);

    if (growThreads > 0) {
      await runOnBestServer(ns, growScript, growThreads, [target], growRam, purchasedServers, hackableServers, target);
    }
    await ns.sleep(delayBetweenSteps);

    if (weakenThreads2 > 0) {
      await runOnBestServer(ns, weakenScript, weakenThreads2, [target], weakenRam, purchasedServers, hackableServers, target);
    }
    await ns.sleep(delayBetweenSteps);

    if (hackThreads > 0) {
      await runOnBestServer(ns, hackScript, hackThreads, [target], hackRam, purchasedServers, hackableServers, target);
    }

    // Start the next batch after a short delay
    await ns.sleep(batchDelay);
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
    (s: string) => ns.serverExists(s) && !s.startsWith("mgmt") && !s.startsWith("home")
  );
  const allServers = ["home", target, ...jobServers, ...hackableServers]; // Use purchased servers and home

  let totalStartedThreads = 0;
  let toAllocate = threads;

  for (const server of allServers) {
    if (toAllocate <= 0) break;

    const availableRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
    const maxThreads = Math.floor(availableRam / ramCost);

    if (maxThreads > 0) {
      const runnableThreads = Math.min(toAllocate, maxThreads);

      ns.scp(script, server);

      const pid = ns.exec(script, server, runnableThreads, ...args);
      if (pid > 0) {
        ns.print(`Started ${script} on ${server} with ${runnableThreads}/${threads} threads.`);
        totalStartedThreads += runnableThreads;
        toAllocate -= runnableThreads;
      } else {
        ns.print(`Failed to start ${script} on ${server} despite sufficient RAM.`);
      }
    } else {
      ns.print(`Insufficient RAM on ${server} for ${script}. Needed per thread: ${ramCost}, Available: ${availableRam}`);
    }
  }

  if (totalStartedThreads === 0) {
    ns.print(`ERROR: Could not allocate any threads for ${script}. Operation skipped due to insufficient resources.`);
  } else if (toAllocate > 0) {
    ns.print(`WARNING: Only allocated ${totalStartedThreads}/${threads} threads for ${script} due to resource constraints.`);
  }

  return totalStartedThreads;
}

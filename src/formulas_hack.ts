import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
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

  const player = ns.getPlayer();

  // Parameters - tweak these to adjust performance
  const hackFraction = 0.25; // Hack 25% of server money per batch
  const batchDelay = 200;    // Time (ms) between launching new batches
  const delayBetweenSteps = 50; // Delay between steps in a single batch

  while (true) {
    const currentSecurity = ns.getServerSecurityLevel(target);
    const minSecurity = ns.getServerMinSecurityLevel(target);
    const currentMoney = ns.getServerMoneyAvailable(target);
    const maxMoney = ns.getServerMaxMoney(target);

    ns.print(
      `Current security: ${currentSecurity}
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
      growThreads = Math.ceil(ns.formulas.hacking.growThreads(targetInfo, player, desiredFinalMoney));
      const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, target);
      weakenThreads1 = Math.ceil(growSecurityIncrease / weakenEffect);
      ns.print(`Growing money on ${target} by ${growMultiplier}x with ${growThreads} threads resulting in ${growSecurityIncrease} security increase.`);
    } else {
      // Otherwise, hack a fraction of the server's money
      ns.print(`Hacking ${hackFraction * 100}% of money on ${target}.`);
      hackThreads = Math.ceil(hackFraction / ns.hackAnalyze(target));

      // After hacking, we need to grow back the money
      // Determine grow threads for returning money to max
      const postHackMoney = currentMoney - (currentMoney * hackFraction);
      const growMultiplier = maxMoney / Math.max(postHackMoney, 1);
      const desiredFinalMoney = postHackMoney * growMultiplier;
      growThreads = Math.ceil(ns.formulas.hacking.growThreads(targetInfo, player, desiredFinalMoney));

      const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, target);

      // We'll do two weakens: one before grow to ensure low security, and one after grow
      // Actually, to simplify: We'll do:
      // Weaken #1: handle pre-existing security above min if needed
      // Grow
      // Weaken #2: handle increase from grow
      // Hack (last, after conditions are right)

      // Let’s always do at least one weaken before grow if security isn't minimal:
      const extraSecFromGrow = growSecurityIncrease;

      // Strategy:
      // Batch order with timing:
      // 0ms: Weaken #1 (to ensure we start at min security)
      // delayBetweenSteps: Grow
      // 2*delayBetweenSteps: Weaken #2 (to fix grow security)
      // 3*delayBetweenSteps: Hack (when server is at max money, min sec)

      // Weaken #1 threads (to ensure security is minimal at start):
      let preWeakenNeeded = 0;
      if (currentSecurity > minSecurity) {
        preWeakenNeeded = Math.ceil((currentSecurity - minSecurity) / weakenEffect);
      }

      // After grow, security goes up by growSecurityIncrease, handle with Weaken #2:
      weakenThreads2 = Math.ceil(extraSecFromGrow / weakenEffect);

      // After that, we hack. Hacking also raises security by hackSecurityIncrease.
      // In a perfect batch setup, we schedule hack last, after the second weaken is done.
      // If we need to handle hack security, it would be in the *next* batch. 
      // For simplicity, this example doesn’t handle post-hack weaken in the same batch.
      // Usually, multiple batches overlap, so a future batch’s first weaken handles this.

      // Consolidate weaken threads:
      // We'll just use preWeakenNeeded as weakenThreads1:
      weakenThreads1 = preWeakenNeeded;
    }

    // Launch a batch (if we have something to do)
    // If all threads are 0, skip to next loop
    if (weakenThreads1 === 0 && growThreads === 0 && weakenThreads2 === 0 && hackThreads === 0) {
      // Nothing to do: just sleep a bit and try again
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
    // Use set delays in execution times. The scripts themselves run immediately when exec is called, 
    // so we’ll just sleep between calls.

    // NOTE: You can try saturating RAM by starting multiple batches quickly. 
    // For example, we could start multiple batches in a row before sleeping.

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

    // Instead of waiting for the entire cycle to finish, start the next batch after a short delay
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

  let totalStartedThreads = 0; // Keep track of successfully started threads
  let toAllocate = threads;

  for (const server of allServers) {
    if (toAllocate <= 0) break; // Stop if all threads have been allocated

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

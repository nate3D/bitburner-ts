import { NS } from "@ns";

/** @param {NS} ns */
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
    if (!dataContent || dataContent === "null" || dataContent === "undefined") {
        ns.tprint(`ERROR: Data file ${datafile} is empty, invalid, or does not exist.`);
        return;
    }

    let constants: any;
    try {
        constants = JSON.parse(dataContent);
    } catch (error) {
        ns.tprint(`ERROR: Failed to parse constants from ${datafile}: ${error}`);
        return;
    }

    if (!constants) {
        ns.tprint(`ERROR: Constants object is null or undefined.`);
        return;
    }

    // Validate and destructure constants
    const {
        targetInfo,
        purchasedServers,
        weakenRam,
        hackRam,
        growRam,
        hackableServers,
    }: {
        targetInfo: { hackDifficulty: number; minDifficulty: number; moneyMax: number; };
        purchasedServers: string[];
        weakenRam: number;
        hackRam: number;
        growRam: number;
        hackableServers: string[];
    } = constants;

    if (!purchasedServers || !Array.isArray(purchasedServers)) {
        ns.tprint(`ERROR: Invalid or missing 'purchasedServers' in constants.`);
        return;
    }
    if (typeof weakenRam !== "number" || typeof hackRam !== "number" || typeof growRam !== "number") {
        ns.tprint(`ERROR: Invalid or missing RAM values in constants.`);
        return;
    }
    if (!hackableServers || !Array.isArray(hackableServers)) {
        ns.tprint(`ERROR: Invalid or missing 'hackableServers' in constants.`);
        return;
    }

    // Use the constants
    ns.print(`Loaded constants from ${datafile}:`);
    ns.print(`Purchased Servers: ${JSON.stringify(purchasedServers)}`);
    ns.print(`Hackable Servers: ${JSON.stringify(hackableServers)}`);
    ns.print(`Weaken RAM: ${weakenRam}, Grow RAM: ${growRam}, Hack RAM: ${hackRam}`);

    const scriptDir = "scripts/";
    const weakenScript = `${scriptDir}weaken.js`;
    const hackScript = `${scriptDir}hack.js`;
    const growScript = `${scriptDir}grow.js`;

    const jobServers = purchasedServers.filter(
        (s: string) =>
            ns.serverExists(s) &&
            !s.startsWith("mgmt") &&
            !s.startsWith("home")
    );
    const allServers = ["home", ...jobServers, target, ...hackableServers];

    // Thread tracker
    const threadTracker: Record<string, number> = {
        weaken: 0,
        grow: 0,
        hack: 0,
    };

    /**
     * Dispatch a job to available servers.
     * @param command - The type of job: "weaken", "grow", or "hack"
     * @param threads - Number of threads required
     */
    async function dispatchJob(command: "weaken" | "grow" | "hack", threads: number): Promise<void> {
        const script = command === "weaken" ? weakenScript : command === "grow" ? growScript : hackScript;
        const ramPerThread = command === "weaken" ? weakenRam : command === "grow" ? growRam : hackRam;

        for (const server of allServers) {
            const availableRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
            const maxThreads = Math.floor(availableRam / ramPerThread);
            const threadsToUse = Math.min(maxThreads, threads);

            if (threadsToUse > 0) {
                ns.exec(script, server, threadsToUse, target, command, Date.now());
                threads -= threadsToUse;
                threadTracker[command] += threadsToUse;

                if (threads <= 0) break;
            }
        }

        if (threads > 0) {
            ns.print(`Unable to allocate ${threads} threads for ${command}. Retrying...`);
            await ns.sleep(1000); // Retry delay
            await dispatchJob(command, threads); // Retry allocation
        }
    }

    /**
     * Main batch loop
     */
    while (true) {
        // Calculate required threads for each stage
        const weakenThreads1 = Math.ceil(
            (targetInfo.hackDifficulty - targetInfo.minDifficulty) / ns.weakenAnalyze(1, constants.coreCount)
        );
        const growThreads = Math.ceil(
            ns.growthAnalyze(constants.targetname, targetInfo.moneyMax / Math.max(ns.getServerMoneyAvailable(constants.targetname), 1))
        );
        const weakenThreads2 = Math.ceil(
            (growThreads * ns.growthAnalyzeSecurity(1, constants.targetname, constants.coreCount)) /
            ns.weakenAnalyze(1, constants.coreCount)
        );
        const hackThreads = Math.floor(
            (ns.getServerMoneyAvailable(constants.targetname) * 0.1) / ns.hackAnalyze(constants.targetname)
        ); // Steal 10% of available money

        // Debug logs for thread calculation
        ns.print(`Calculated Threads: Weaken1: ${weakenThreads1}, Grow: ${growThreads}, Weaken2: ${weakenThreads2}, Hack: ${hackThreads}`);

        ns.print("Starting new batch...");

        await dispatchJob("weaken", weakenThreads1);
        await ns.sleep(ns.getWeakenTime(target) + 100);

        await dispatchJob("grow", growThreads);
        await ns.sleep(ns.getGrowTime(target) + 100);

        await dispatchJob("weaken", weakenThreads2);
        await ns.sleep(ns.getWeakenTime(target) + 100);

        await dispatchJob("hack", hackThreads);
        await ns.sleep(ns.getHackTime(target) + 100);
    }
}

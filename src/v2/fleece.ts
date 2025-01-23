import { NS } from "@ns";

/** @param {NS} ns */
export async function main(ns: NS): Promise<void> {
    const target = ns.args[0] as string;
    if (!target) {
        ns.tprint("ERROR: Target server not specified.");
        ns.tprint("Usage: run drain-server.js [target]");
        return;
    }

    ns.disableLog("ALL"); // Disable verbose logs for cleaner output

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

    const hackScript = "scripts/hack.js";
    const hackRam = 1.6;


    // Validate and destructure constants
    const {
        targetInfo,
        purchasedServers,
        weakenRam,
        growRam,
        hackableServers,
    }: {
        targetInfo: { hackDifficulty: number; minDifficulty: number; moneyMax: number; };
        purchasedServers: string[];
        weakenRam: number;
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

    const jobServers = purchasedServers.filter(
        (s: string) =>
            ns.serverExists(s) &&
            !s.startsWith("mgmt") &&
            !s.startsWith("home")
    );
    const allServers = ["home", ...jobServers, target, ...hackableServers];

    // Use the constants
    ns.print(`Loaded constants from ${datafile}:`);
    ns.print(`Purchased Servers: ${JSON.stringify(purchasedServers)}`);
    ns.print(`Hackable Servers: ${JSON.stringify(hackableServers)}`);

    const threadTracker: Record<string, number> = {
        hack: 0,
    };

    /**
     * Dispatch a job to available servers.
     * @param command - The type of job: "weaken", "grow", or "hack"
     * @param threads - Number of threads required
     */
    async function dispatchJob(command: "weaken" | "grow" | "hack", threads: number): Promise<void> {
        const ramPerThread = command === "hack" ? hackRam : 0;

        for (const server of allServers) {
            const availableRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
            const maxThreads = Math.floor(availableRam / ramPerThread);
            const threadsToUse = Math.min(maxThreads, threads);

            if (threadsToUse > 0) {
                ns.print(`Dispatching ${threadsToUse} threads to ${server} for ${command}...`);
                ns.exec(hackScript, server, threadsToUse, target, command, Date.now());
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

    // Calculate the number of threads needed to hack all the money
    const targetMoney = ns.getServerMoneyAvailable(target);
    const hackAnalyze = ns.hackAnalyze(target); // Money stolen per thread (as a fraction)
    if (hackAnalyze <= 0) {
        ns.tprint("ERROR: Hack analysis returned 0. Hacking level may be too low for this server.");
        return;
    }

    ns.tprint(`Target money: ${targetMoney}, Hack analyze: ${hackAnalyze}, Hack difficulty: ${targetInfo.hackDifficulty}, Money max: ${targetInfo.moneyMax}`);
    const hackThreads = Math.ceil(1 / hackAnalyze);
    ns.tprint(`Calculated hack threads to drain ${target}: ${hackThreads}`);

    // Dispatch hack threads
    ns.print(`Dispatching ${hackThreads} hack threads to drain ${target}...`);
    await dispatchJob("hack", hackThreads);
    ns.tprint(`Hack job dispatched. Monitor progress in the logs.`);
}

import { NS } from "@ns";

/** @param {NS} ns **/
export async function main(ns: NS): Promise<void> {
  const hackScript = "hack.js"; // Replace with your hack script
  const supportFiles = [
    "scripts/hack.js",
    "scripts/weaken.js",
    "scripts/grow.js",
    "logger.js",
  ]; // Additional files needed by the hack script
  const purchasedServers = ns
    .getPurchasedServers()
    .filter((s: string) => !(s.startsWith("mgmt") || s.startsWith("home"))); // Exclude private servers

  if (purchasedServers.length === 0) {
    ns.tprint("No servers available for hacking.");
    return;
  }
  const targetServers = findBestTargets(ns, 3); // Find top 3 target servers (adjust as needed)

  if (targetServers.length === 0) {
    ns.tprint("No valid targets found.");
    return;
  }

  for (const srv of purchasedServers) {
    // Calculate available RAM and max threads
    const maxRam = ns.getServerMaxRam(srv);
    const usedRam = ns.getServerUsedRam(srv);
    const availableRam = maxRam - usedRam;
    const scriptRam = ns.getScriptRam(hackScript);
    const maxThreads = Math.floor(availableRam / scriptRam);

    if (maxThreads > 0) {
      // Distribute threads evenly among top target servers
      const threadsPerTarget = Math.floor(maxThreads / targetServers.length);
      for (const target of targetServers) {
        if (threadsPerTarget > 0) {
          await prepareServer(ns, srv, [hackScript, ...supportFiles]); // Ensure required files are on the server
          const pid = ns.exec(
            hackScript,
            srv,
            threadsPerTarget,
            target.hostname,
            0.75,
            5
          ); // Add args for MONEY_THRESHOLD, SECURITY_THRESHOLD
          if (pid > 0) {
            ns.tprint(
              `Started ${hackScript} on ${srv} targeting ${target.hostname} with ${threadsPerTarget} threads`
            );
          } else {
            ns.tprint(`Failed to start ${hackScript} on ${srv}`);
          }
        }
      }
    } else {
      ns.tprint(`Not enough RAM on ${srv} to run ${hackScript}`);
    }
  }
}

/** Ensures required scripts and files are copied to the target server */
async function prepareServer(
  ns: NS,
  server: string,
  files: string[]
): Promise<void> {
  for (const file of files) {
    if (!ns.fileExists(file, server)) {
      await ns.scp(file, server);
      ns.tprint(`Copied ${file} to ${server}`);
    }
  }
}

/** Find the best targets based on available money and security level */
function findBestTargets(ns: NS, count: number) {
  const servers = ns
    .scan("home") // Scan all accessible servers
    .filter((s) => s !== "home" && !s.startsWith("srv")) // Exclude home and purchased servers
    .map((s) => ({
      hostname: s,
      moneyAvailable: ns.getServerMoneyAvailable(s),
      moneyMax: ns.getServerMaxMoney(s),
      minDifficulty: ns.getServerMinSecurityLevel(s),
    }))
    .filter((s) => s.moneyMax > 0 && ns.hasRootAccess(s.hostname)) // Ensure server has money and root access
    .sort(
      (a, b) =>
        b.moneyAvailable - a.moneyAvailable || a.minDifficulty - b.minDifficulty
    ); // Sort by money then security

  return servers.slice(0, count); // Return the top 'count' servers
}

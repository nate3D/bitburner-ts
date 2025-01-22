import { NS } from "@ns";
import { gatherConstants, getAllServers, findBestServers } from "main";

/** 
 * @param {NS} ns - Netscript API object
 */
export async function main(ns: NS): Promise<void> {
    const hackScript = "v2/hack.js";

    const jobServers = ns.getPurchasedServers().filter((s: string) => ns.serverExists(s) && !s.startsWith("mgmt") && !s.startsWith("home"));
    await findBestServers(ns, 20);
    const top_servers = JSON.parse(ns.read("/data/top_servers.json"));
    const targetServers = top_servers.map((s: { server: string }) => s.server);
    const allServers = (await getAllServers(ns)).filter((s: string) => !s.startsWith("mgmt") || !s.startsWith("home") || !s.startsWith("srv"));
    const payloads = [
        "scripts/hack.js",
        "scripts/weaken.js",
        "scripts/grow.js",
    ];
    payloads.push(hackScript);
    const servers: string[] = [];
    const emptyServers: string[] = [];
    const emptyServersFile = "/empty-servers.txt";
    const failedServers: string[] = [];
    const failedServersFile = "/failed-servers.txt";

    // Identify vulnerable servers, excluding "srv" servers and home
    for (const server of allServers) {
        if (!ns.hasRootAccess(server)) {
            let openPorts = 0;

            // Check for port-opening programs and open ports
            if (ns.fileExists("BruteSSH.exe", "home")) {
                ns.brutessh(server);
                openPorts++;
            }
            if (ns.fileExists("FTPCrack.exe", "home")) {
                ns.ftpcrack(server);
                openPorts++;
            }
            if (ns.fileExists("relaySMTP.exe", "home")) {
                ns.relaysmtp(server);
                openPorts++;
            }
            if (ns.fileExists("HTTPWorm.exe", "home")) {
                ns.httpworm(server);
                openPorts++;
            }
            if (ns.fileExists("SQLInject.exe", "home")) {
                ns.sqlinject(server);
                openPorts++;
            }

            // Check if enough ports are open to nuke
            if (openPorts >= ns.getServerNumPortsRequired(server)) {
                ns.nuke(server);
            }
        }

        if (ns.hasRootAccess(server)) {
            servers.push(server);
        }

        // Create a datafile for each server
        const datafile = await gatherConstants(ns, server, hackScript);
        ns.scp(datafile, server, "home");
        for (const payload of payloads) {
            ns.scp(payload, server, "home");
        }
    }

    // Copy datafiles and payloads to all job servers
    for (const jobServer of jobServers) {
        for (const server of servers) {
            ns.scp(`/data/${server}-constants.json`, jobServer, "home");
        }

        for (const payload of payloads) {
            ns.scp(payload, jobServer, "home");
        }
    }

    if (servers.length === 0) {
        ns.tprint(`No vulnerable servers found.`);
        return;
    }

    ns.tprint(
        `
    Found ${servers.length} vulnerable servers: ${servers.join(", ")}
    Targeting ${targetServers.length} servers: ${targetServers.join(", ")}
    `
    );
    await ns.sleep(5000);

    const emptyServersData = JSON.stringify(emptyServers);
    ns.write(emptyServersFile, emptyServersData, "w");

    const failedServersData = JSON.stringify(failedServers);
    ns.write(failedServersFile, failedServersData, "w");
}

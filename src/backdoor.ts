import { NS } from "@ns";
import { getAllServers } from "./main";

/** @param {NS} ns */
export async function main(ns: NS): Promise<void> {
    const servers = await getAllServers(ns);

    for (const server in servers) {
        if (server.startsWith("srv") || server.startsWith("mgmt") || server === "home") {
            continue;
        }

        const openPorts = ns.getServerNumPortsRequired(server);
        const requiredPorts = ns.getServerRequiredHackingLevel(server);
        const hackLevel = ns.getHackingLevel();

        // Check if the server is already backdoored
        if (ns.hasRootAccess(server)) {
            ns.infiltration.getInfiltration
        }
    }
}
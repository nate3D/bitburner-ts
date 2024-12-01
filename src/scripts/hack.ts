import { NS } from "@ns";

/**
 * This script performs a hack operation on the target server.
 *
 * @param ns - Bitburner namespace.
 */
export async function main(ns: NS) {
  const [target] = ns.args;
  if (typeof target !== "string") {
    ns.tprint("ERROR: Invalid target specified. Usage: run hack.ts [target]");
    return;
  }

  await ns.hack(target);
}

import { NS } from "@ns";

/**
 * This script performs a weaken operation on the target server.
 *
 * @param ns - Bitburner namespace.
 */
export async function main(ns: NS) {
  const [target] = ns.args;
  if (typeof target !== "string") {
    ns.tprint("ERROR: Invalid target specified. Usage: run weaken.ts [target]");
    return;
  }

  await ns.weaken(target);
}

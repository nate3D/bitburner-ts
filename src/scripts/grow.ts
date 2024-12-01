import { NS } from "@ns";

/**
 * This script performs a grow operation on the target server.
 *
 * @param ns - Bitburner namespace.
 */
export async function main(ns: NS) {
  const [target] = ns.args;
  if (typeof target !== "string") {
    ns.tprint("ERROR: Invalid target specified. Usage: run grow.ts [target]");
    return;
  }

  await ns.grow(target);
}

import { NS } from "@ns";
import { logToFile } from "logger";

/** @param {NS} ns */
export async function main(ns: NS): Promise<void> {
  const bladeburner = ns.bladeburner;
  const infiltrationName = "Infiltrate Joe's Guns"; // Task name
  const targetFaction = "Shadows of Anarchy"; // Target faction for rep
  const staminaThreshold = 0.5; // Minimum stamina percentage to continue

  while (true) {
    // Check stamina levels
    const [currentStamina, maxStamina] = bladeburner.getStamina();
    const staminaRatio = currentStamina / maxStamina;

    if (staminaRatio < staminaThreshold) {
      ns.print(`Low stamina (${Math.round(staminaRatio * 100)}%). Resting...`);
      bladeburner.startAction("General", "Hyperbolic Regeneration Chamber");
      await ns.sleep(10000); // Wait for stamina to regenerate
      continue;
    }

    // Perform infiltration
    const actionSuccess = bladeburner.startAction("Contracts", infiltrationName);
    if (!actionSuccess) {
      ns.print(`Failed to start infiltration. Check stats or requirements.`);
      break;
    }

    ns.print(`Performing infiltration...`);
    while (bladeburner.getActionCountRemaining("Contracts", infiltrationName) > 0) {
      await ns.sleep(1000); // Check progress every second
    }

    ns.print(`Completed an infiltration! Checking faction rep.`);

    // Check if faction reputation meets the goal
    const rep = ns.singularity.getFactionRep(targetFaction);
    ns.print(`Current reputation with ${targetFaction}: ${rep}`);
    // Add a break condition here if a target reputation level is desired
  }
}

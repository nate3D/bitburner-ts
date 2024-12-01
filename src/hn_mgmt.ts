import { NS } from "@ns";

/** @param {NS} ns **/
export async function main(ns: NS): Promise<void> {
  const hacknet = ns.hacknet;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const money = ns.getPlayer().money;
    let cheapestUpgrade: { cost: number; action: () => void } | null = null;

    // Check costs for upgrading existing nodes
    for (let i = 0; i < hacknet.numNodes(); i++) {
      const levelCost = hacknet.getLevelUpgradeCost(i, 1);
      if (
        levelCost <= money &&
        (!cheapestUpgrade || levelCost < cheapestUpgrade.cost)
      ) {
        cheapestUpgrade = {
          cost: levelCost,
          action: () => hacknet.upgradeLevel(i, 1),
        };
      }

      const ramCost = hacknet.getRamUpgradeCost(i, 1);
      if (
        ramCost <= money &&
        (!cheapestUpgrade || ramCost < cheapestUpgrade.cost)
      ) {
        cheapestUpgrade = {
          cost: ramCost,
          action: () => hacknet.upgradeRam(i, 1),
        };
      }

      const coreCost = hacknet.getCoreUpgradeCost(i, 1);
      if (
        coreCost <= money &&
        (!cheapestUpgrade || coreCost < cheapestUpgrade.cost)
      ) {
        cheapestUpgrade = {
          cost: coreCost,
          action: () => hacknet.upgradeCore(i, 1),
        };
      }
    }

    // Check cost for purchasing a new node
    const newNodeCost = hacknet.getPurchaseNodeCost();
    if (
      newNodeCost <= money &&
      (!cheapestUpgrade || newNodeCost < cheapestUpgrade.cost)
    ) {
      cheapestUpgrade = {
        cost: newNodeCost,
        action: () => hacknet.purchaseNode(),
      };
    }

    // Execute the cheapest upgrade or wait for more money
    if (cheapestUpgrade) {
      cheapestUpgrade.action();
      ns.print(`Purchased upgrade for ${cheapestUpgrade.cost}`);
    } else {
      ns.print("Not enough money for any upgrade. Waiting...");
    }

    await ns.sleep(100); // Sleep for a second before checking again
  }
}

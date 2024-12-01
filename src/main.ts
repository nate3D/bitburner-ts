import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  const target = ns.args[0] as string;
  const host = ns.getHostname();

  if (!target) {
    ns.tprint("ERROR: Target server not specified.");
    ns.tprint("Usage: run main.ts [target]");
    return;
  }

  ns.tprint(`Gathering constants for ${target}...`);
  const datafile = await gatherConstants(ns, target, host);

  if (!datafile) {
    ns.tprint(`ERROR: Could not gather constants for ${target}.`);
    return;
  }
}

export async function gatherConstants(ns: NS, target: string, host?: string): Promise<string> {
  const hostname = host || ns.getHostname();
  const targetname = target || ns.getHostname();
  const datafile = `data/${targetname}-constants.json`;

  const serverMaxMoney = ns.getServerMaxMoney(targetname);
  const serverMoneyAvailable = ns.getServerMoneyAvailable(targetname);
  const serverMaxRam = ns.getServerMaxRam(targetname);
  const serverMinSecurityLvl = ns.getServerMinSecurityLevel(targetname);
  const serverGrowthRate = ns.getServerGrowth(targetname);
  const scriptRam = ns.getScriptRam("hack.js", "home");
  const hostInfo = ns.getServer(hostname);
  const targetInfo = ns.getServer(targetname);
  const coreCount = hostInfo.cpuCores;
  const hackChance = ns.hackAnalyzeChance(targetname);
  const hackPerThread = ns.hackAnalyze(targetname);
  const hackAnalyzeChance = ns.hackAnalyzeChance(targetname);
  const growthSecurityIncrease = ns.growthAnalyzeSecurity(1, targetname, coreCount);
  const hackTime = ns.getHackTime(targetname);
  const growTime = ns.getGrowTime(targetname);
  const weakenTime = ns.getWeakenTime(targetname);
  const weakenEffect = ns.weakenAnalyze(1, coreCount);
  const hackingLevel = ns.getHackingLevel();

  const constants = {
    hostname: hostname,
    maxMoney: serverMaxMoney,
    moneyAvailable: serverMoneyAvailable,
    maxRam: serverMaxRam,
    minSecurity: serverMinSecurityLvl,
    growthRate: serverGrowthRate,
    growthSecurityIncrease: growthSecurityIncrease,
    coreCount: coreCount,
    hackChance: hackChance,
    hackPerThread: hackPerThread,
    hackAnalyzeChance: hackAnalyzeChance,
    hackTime: hackTime,
    growTime: growTime,
    weakenTime: weakenTime,
    weakenEffect: weakenEffect,
    scriptRam: scriptRam,
    hackingLevel: hackingLevel,
    hostInfo: hostInfo,
    targetInfo: targetInfo,
  };
  await ns.write(datafile, JSON.stringify(constants), "w");
  ns.tprint(`Wrote constants to ${datafile}`);

  return datafile;
}

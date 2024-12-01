import { NS } from "@ns";

/**
 * Logs a message to a shared log file with a timestamp and script name.
 * @param ns - Netscript API object
 * @param message - The message to log
 */
export function logToFile(ns: NS, message: string): void {
  const logFile = "/shared-work-log.txt";
  const logMessage = `[${new Date().toISOString()}] Script: ${ns.getScriptName()} - ${message}\n`;

  ns.write(logFile, logMessage, "a"); // Append the log message to the file
}

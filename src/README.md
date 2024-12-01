# Hack and Deploy Script Suite

This suite of scripts is designed to automate hacking operations in Bitburner, deploy scripts across servers, and optimize resource usage.

## Scripts Overview

### 1. `setup.js`
- **Purpose**: 
  - Deploys the hacking scripts (`hack.js`, `grow.js`, `weaken.js`) and their dependencies to all available servers.
  - Automatically gains root access to vulnerable servers.
  - Prepares and executes the `hack.js` script with appropriate configuration.

- **Features**:
  - Identifies all accessible servers in the network.
  - Gathers constants (like server stats) for each server using `gatherConstants`.
  - Skips private or already-prepared servers.
  - Kills existing processes to free up resources before deployment.

- **Usage**:
  ```bash
  run setup.js [force=true|false]
  ```
  - **`true`**: Forces deployment and execution on all servers, even if `hack.js` is already running.
  - **`false`**: Skips servers already running `hack.js`.

---

### 2. `hack.js`
- **Purpose**: 
  - Automates hacking operations (hack, grow, weaken) on a target server using precomputed constants to minimize RAM usage. It leverages batch processing to optimize resource allocation and maximize efficiency.

- **Features**:
  - Dynamically balances threads for each operation based on available RAM.
  - Adapts to the current state of the target server, ensuring efficient resource usage.
  - Designed to run in parallel across multiple servers.

- **Usage**:
  This script is deployed and executed automatically by `setup.js`. You can also run it manually:
  ```bash
  run hack.js [target-server]
  ```
  Replace `[target-server]` with the hostname of the server to target.

---

### 3. `gatherConstants`
- **Purpose**: 
  - Precomputes and saves important server constants (e.g., security level, growth rate) to optimize hacking operations.

- **Usage**:
  Called programmatically by `setup.js`.

---

### 4. `weaken.js`, `grow.js`, and `hack.js` (helper scripts)
- **Purpose**:
  - Perform individual operations (`weaken`, `grow`, `hack`) as part of the main hacking strategy.

- **Usage**:
  These scripts are deployed and executed by `hack.js` and `setup.js`. They are not meant to be run directly.

---

## Setup and Usage Guide

### Prerequisites
1. **Required Port-Opening Programs**:
   - Ensure you have any necessary programs (`BruteSSH.exe`, `FTPCrack.exe`, `relaySMTP.exe`, `HTTPWorm.exe`, `SQLInject.exe`) to open ports and gain root access to servers. Re-run the setup script if needed as these programs become available.

1. **Scripts**:
   - Place the following scripts in the home directory:
     - `setup.js`
     - `hack.js`
     - `gatherConstants`
     - `weaken.js`, `grow.js`, `hack.js` (helpers)
     - `logger.js` (optional for logging)

2. **Server Requirements**:
   - The target servers must have sufficient RAM (6.05GB) to run the deployed scripts. 

---

### Deploy and Execute

1. **Deploy and Run Scripts**:
   - Use `setup.js` to scan and deploy scripts across the network:
     ```bash
     run setup.js true
     ```

2. **Monitor Execution**:
   - Check logs or use commands like `ps` and `free` to monitor script execution and resource usage:
     ```bash
     ps
     free
     ```

---

## Example Workflow

1. Run the setup script:
   ```bash
   run setup.js true
   ```

2. Check vulnerable servers and deployed scripts:
   ```bash
   cat /empty-servers.txt
   ps [server-name]
   ```

3. Manually execute `hack.js` if needed:
   ```bash
   run hack.js n00dles
   ```

---

## Advanced Tips

- **Optimize Deployment**:
  - Use the `force=false` option in `setup.js` to skip servers already running hacking operations, saving deployment time.

- **Scaling**:
  - Customize `setup.js` to include private or purchased servers for larger-scale hacking operations.

- **Debugging**:
  - Use `ns.tprint` logs extensively to debug RAM allocation or deployment issues.

---

## Known Issues

- **RAM Overload**:
  - If a server has insufficient RAM, `hack.js` will attempt to run with the maximum possible threads.
  - Ensure servers have enough RAM to support multiple scripts.
 specific port-opening programs to gain root access.
 
---

## Future Enhancements

- **Dynamic Thread Allocation**:
  - Further optimize `hack.js` to split operations across multiple servers dynamically.
- **Logging Improvements**:
  - Implement `logger.js` for better monitoring and debugging.
- **Interactive UI**:
  - Add an interface for real-time monitoring of hacking operations.

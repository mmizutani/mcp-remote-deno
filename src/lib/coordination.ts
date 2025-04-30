/**
 * This module handles authentication coordination between multiple instances of the MCP client or proxy.
 * It manages lockfiles to prevent conflicts and enables sharing authentication state between processes.
 *
 * The coordination system allows multiple MCP processes to work together, so that when one process
 * completes the OAuth authentication flow, other processes can reuse the same tokens without
 * requiring the user to authenticate again.
 *
 * @example
 * ```ts
 * import { coordinateAuth } from "@mmizutani/mcp-remote-deno/lib/coordination";
 * import { EventEmitter } from "node:events";
 *
 * // Set up coordination between multiple instances
 * const events = new EventEmitter();
 * const serverUrlHash = getServerUrlHash(serverUrl);
 *
 * const { server, waitForAuthCode, skipBrowserAuth } = await coordinateAuth(
 *   serverUrlHash,
 *   callbackPort,
 *   events
 * );
 *
 * // If skipBrowserAuth is true, another instance is handling authentication
 * if (skipBrowserAuth) {
 *   console.log("Will use tokens from another instance");
 * }
 * ```
 *
 * @module
 */

import {
  checkLockfile,
  createLockfile,
  deleteLockfile,
  getConfigFilePath,
  type LockfileData,
} from "./mcp-auth-config.ts";
import type { EventEmitter } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { log, setupOAuthCallbackServerWithLongPoll } from "./utils.ts";
import createServer from "./deno-http-server.ts";

/**
 * Checks if a process with the given PID is running
 * @param pid The process ID to check
 * @returns True if the process is running, false otherwise
 */
export async function isPidRunning(pid: number): Promise<boolean> {
  try {
    // Deno doesn't have a direct equivalent to process.kill(pid, 0)
    // On non-Windows platforms, we can try to use kill system call to check
    if (Deno.build.os !== "windows") {
      try {
        // Using Deno.run to check if process exists
        const command = new Deno.Command("kill", {
          args: ["-0", pid.toString()],
          stdout: "null",
          stderr: "null",
        });
        const { success } = await command.output();
        return success;
      } catch {
        return false;
      }
    } else {
      // On Windows, use tasklist to check if process exists
      try {
        const command = new Deno.Command("tasklist", {
          args: ["/FI", `PID eq ${pid}`, "/NH"],
          stdout: "piped",
        });
        const { stdout } = await command.output();
        const output = new TextDecoder().decode(stdout);
        return output.includes(pid.toString());
      } catch {
        return false;
      }
    }
  } catch {
    return false;
  }
}

/**
 * Checks if a lockfile is valid (process running and endpoint accessible)
 * @param lockData The lockfile data to validate
 * @returns True if the lockfile is valid and the process is still running, false otherwise
 */
export async function isLockValid(lockData: LockfileData): Promise<boolean> {
  // Check if the lockfile is too old (over 30 minutes)
  const MAX_LOCK_AGE = 30 * 60 * 1000; // 30 minutes
  if (Date.now() - lockData.timestamp > MAX_LOCK_AGE) {
    log("Lockfile is too old");
    return false;
  }

  // Check if the process is still running
  if (!(await isPidRunning(lockData.pid))) {
    log("Process from lockfile is not running");
    return false;
  }

  // Check if the endpoint is accessible
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    const response = await fetch(
      `http://127.0.0.1:${lockData.port}/wait-for-auth?poll=false`,
      {
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);
    return response.status === 200 || response.status === 202;
  } catch (error) {
    log(`Error connecting to auth server: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Waits for authentication from another server instance
 * @param port The port of the other server instance to connect to
 * @returns True if authentication completed successfully, false otherwise
 */
export async function waitForAuthentication(port: number): Promise<boolean> {
  log(`Waiting for authentication from the server on port ${port}...`);

  try {
    while (true) {
      const url = `http://127.0.0.1:${port}/wait-for-auth`;
      log(`Querying: ${url}`);
      const response = await fetch(url);

      if (response.status === 200) {
        // Auth completed, but we don't return the code anymore
        log("Authentication completed by other instance");
        return true;
      }
      if (response.status === 202) {
        // Continue polling
        log("Authentication still in progress");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        log(`Unexpected response status: ${response.status}`);
        return false;
      }
    }
  } catch (error) {
    log(`Error waiting for authentication: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Coordinates authentication between multiple instances of the client/proxy
 * @param serverUrlHash The hash of the server URL for lockfile identification
 * @param callbackPort The port to use for the callback server
 * @param events The event emitter to use for signaling between components
 * @returns An object with the HTTP server, waitForAuthCode function, and a flag indicating if browser auth can be skipped
 */
export async function coordinateAuth(
  serverUrlHash: string,
  callbackPort: number,
  events: EventEmitter,
): Promise<
  {
    server: Server;
    waitForAuthCode: () => Promise<string>;
    skipBrowserAuth: boolean;
  }
> {
  // Check for a lockfile (disabled on Windows for the time being)
  const lockData = Deno.build.os === "windows"
    ? null
    : await checkLockfile(serverUrlHash);

  // If there's a valid lockfile, try to use the existing auth process
  if (lockData && (await isLockValid(lockData))) {
    log(`Another instance is handling authentication on port ${lockData.port}`);

    try {
      // Try to wait for the authentication to complete
      const authCompleted = await waitForAuthentication(lockData.port);
      if (authCompleted) {
        log("Authentication completed by another instance");

        // Setup a dummy server - the client will use tokens directly from disk
        const dummyServer = createServer().listen(0, "127.0.0.1"); // Listen on any available port on localhost only

        // This shouldn't actually be called in normal operation, but provide it for API compatibility
        const dummyWaitForAuthCode = () => {
          log(
            "WARNING: waitForAuthCode called in secondary instance - this is unexpected",
          );
          // Return a promise that never resolves - the client should use the tokens from disk instead
          return new Promise<string>(() => {});
        };

        return {
          server: dummyServer,
          waitForAuthCode: dummyWaitForAuthCode,
          skipBrowserAuth: true,
        };
      }
      log("Taking over authentication process...");
    } catch (error) {
      log(`Error waiting for authentication: ${error}`);
    }

    // If we get here, the other process didn't complete auth successfully
    await deleteLockfile(serverUrlHash);
  } else if (lockData) {
    // Invalid lockfile, delete its
    log("Found invalid lockfile, deleting it");
    await deleteLockfile(serverUrlHash);
  }

  // Create our own lockfile
  const { server, waitForAuthCode, authCompletedPromise: _ } =
    setupOAuthCallbackServerWithLongPoll({
      port: callbackPort,
      path: "/oauth/callback",
      events,
    });

  // Get the actual port the server is running on
  const address = server.address() as AddressInfo;
  const actualPort = address.port;

  log(
    `Creating lockfile for server ${serverUrlHash} with process ${Deno.pid} on port ${actualPort}`,
  );
  await createLockfile(serverUrlHash, Deno.pid, actualPort);

  // Make sure lockfile is deleted on process exit
  const cleanupHandler = async () => {
    try {
      log(`Cleaning up lockfile for server ${serverUrlHash}`);
      await deleteLockfile(serverUrlHash);
    } catch (error) {
      log(`Error cleaning up lockfile: ${error}`);
    }
  };

  // Setup exit handlers for Deno
  // Note: Deno doesn't have process.once but we can use addEventListener
  // Use unload event instead of beforeunload signal
  addEventListener("unload", () => {
    try {
      // Synchronous cleanup
      const configPath = getConfigFilePath(serverUrlHash, "lock.json");
      // Use Deno's synchronous file API
      try {
        Deno.removeSync(configPath);
      } catch (_) {
        // Ignore errors
      }
    } catch (_) {
      // Ignore errors during exit
    }
  });

  // Also handle SIGINT separately
  Deno.addSignalListener("SIGINT", async () => {
    await cleanupHandler();
    Deno.exit(0);
  });

  return {
    server,
    waitForAuthCode,
    skipBrowserAuth: false,
  };
}

import {
  type OAuthClientProvider,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { OAuthCallbackServerOptions } from "./types.ts";
import net from "node:net";
import crypto from "node:crypto";
import createServer from "./deno-http-server.ts";

// Package version from deno.json (set a constant for now)
/**
 * Current version of the MCP Remote package
 */
export const MCP_REMOTE_VERSION = "0.0.1";

const pid = Deno.pid;
/**
 * Logs a message to the console with the process ID for identification
 * @param str The message to log
 * @param rest Additional parameters to log
 */
export function log(str: string, ...rest: unknown[]) {
  // Using stderr so that it doesn't interfere with stdout
  console.error(`[${pid}] ${str}`, ...rest);
}

/**
 * Helper function to safely get a message identifier for logging
 * @param message The message to extract an identifier from
 * @returns A string or number identifier, or undefined if none could be extracted
 */
function getMessageIdentifier(message: unknown): string | number | undefined {
  if (typeof message !== "object" || message === null) return undefined;

  // Check if it's a request or notification with a method
  if ("method" in message && message.method !== undefined) {
    return String(message.method);
  }

  // Check if it's a response with an id
  if ("id" in message && message.id !== undefined) {
    const id = message.id;
    return typeof id === "string" || typeof id === "number" ? id : undefined;
  }

  return undefined;
}

/**
 * Starting port number to use when finding an available port
 */
export const AVAILABLE_PORT_START = 3000;

/**
 * Creates a bidirectional proxy between two transports
 * @param params Object containing the transport connections to proxy between
 * @param params.transportToClient Transport connection to the client
 * @param params.transportToServer Transport connection to the server
 */
export function mcpProxy(
  { transportToClient, transportToServer }: {
    transportToClient: Transport;
    transportToServer: Transport;
  },
) {
  let transportToClientClosed = false;
  let transportToServerClosed = false;

  transportToClient.onmessage = (message) => {
    log("[Local→Remote]", getMessageIdentifier(message));
    transportToServer.send(message).catch(onServerError);
  };

  transportToServer.onmessage = (message) => {
    log("[Remote→Local]", getMessageIdentifier(message));
    transportToClient.send(message).catch(onClientError);
  };

  transportToClient.onclose = () => {
    if (transportToServerClosed) {
      return;
    }

    transportToClientClosed = true;
    transportToServer.close().catch(onServerError);
  };

  transportToServer.onclose = () => {
    if (transportToClientClosed) {
      return;
    }
    transportToServerClosed = true;
    transportToClient.close().catch(onClientError);
  };

  transportToClient.onerror = onClientError;
  transportToServer.onerror = onServerError;

  function onClientError(error: Error) {
    log("Error from local client:", error);
  }

  function onServerError(error: Error) {
    log("Error from remote server:", error);
  }
}

/**
 * Creates and connects to a remote SSE server with OAuth authentication
 * @param serverUrl The URL of the remote server
 * @param authProvider The OAuth client provider
 * @param headers Additional headers to send with the request
 * @param waitForAuthCode Function to wait for the auth code
 * @param skipBrowserAuth Whether to skip browser auth and use shared auth
 * @returns The connected SSE client transport
 */
export async function connectToRemoteServer(
  serverUrl: string,
  authProvider: OAuthClientProvider,
  headers: Record<string, string>,
  waitForAuthCode: () => Promise<string>,
  skipBrowserAuth = false,
): Promise<SSEClientTransport> {
  log(`[${pid}] Connecting to remote server: ${serverUrl}`);
  const url = new URL(serverUrl);

  // Create transport with eventSourceInit to pass Authorization header if present
  const eventSourceInit = {
    fetch: (url: string | URL, init?: RequestInit) => {
      return Promise.resolve(authProvider?.tokens?.()).then((tokens) =>
        fetch(url, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string> | undefined),
            ...headers,
            ...(tokens?.access_token
              ? { Authorization: `Bearer ${tokens.access_token}` }
              : {}),
            Accept: "text/event-stream",
          } as Record<string, string>,
        })
      );
    },
  };

  const transport = new SSEClientTransport(url, {
    authProvider,
    requestInit: { headers },
    eventSourceInit,
  });

  try {
    await transport.start();
    log("Connected to remote server");
    return transport;
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.message.includes("Unauthorized"))
    ) {
      if (skipBrowserAuth) {
        log(
          "Authentication required but skipping browser auth - using shared auth",
        );
      } else {
        log("Authentication required. Waiting for authorization...");
      }

      // Wait for the authorization code from the callback
      const code = await waitForAuthCode();

      try {
        log("Completing authorization...");
        await transport.finishAuth(code);

        // Create a new transport after auth
        const newTransport = new SSEClientTransport(url, {
          authProvider,
          requestInit: { headers },
        });
        await newTransport.start();
        log("Connected to remote server after authentication");
        return newTransport;
      } catch (authError) {
        log("Authorization error:", authError);
        throw authError;
      }
    } else {
      log("Connection error:", error);
      throw error;
    }
  }
}

/**
 * Sets up an HTTP server to handle OAuth callbacks
 * @param options The server options
 * @returns An object with the server, authCode, and waitForAuthCode function
 */
export function setupOAuthCallbackServer(options: OAuthCallbackServerOptions) {
  const { server, authCode, waitForAuthCode } =
    setupOAuthCallbackServerWithLongPoll(options);
  return { server, authCode, waitForAuthCode };
}

/**
 * Sets up an HTTP server to handle OAuth callbacks with long polling support
 * @param options The server options including port, path, and event emitter
 * @returns An object with the server, authCode, waitForAuthCode function, and authCompletedPromise
 */
export function setupOAuthCallbackServerWithLongPoll(
  options: OAuthCallbackServerOptions,
) {
  let authCode: string | null = null;
  const app = createServer();

  // Create a promise to track when auth is completed
  let authCompletedResolve: (code: string) => void;
  const authCompletedPromise = new Promise<string>((resolve) => {
    authCompletedResolve = resolve;
  });

  // Long-polling endpoint
  app.get("/wait-for-auth", (req, res) => {
    if (authCode) {
      // Auth already completed - just return 200 without the actual code
      // Secondary instances will read tokens from disk
      log("Auth already completed, returning 200");
      res.status(200).send("Authentication completed");
      return;
    }

    if (req.query.poll === "false") {
      log("Client requested no long poll, responding with 202");
      res.status(202).send("Authentication in progress");
      return;
    }

    // Long poll - wait for up to 30 seconds
    const longPollTimeout = setTimeout(() => {
      log("Long poll timeout reached, responding with 202");
      res.status(202).send("Authentication in progress");
    }, 30000);

    // If auth completes while we're waiting, send the response immediately
    authCompletedPromise
      .then(() => {
        clearTimeout(longPollTimeout);
        if (!res.headersSent) {
          log("Auth completed during long poll, responding with 200");
          res.status(200).send("Authentication completed");
        }
      })
      .catch(() => {
        clearTimeout(longPollTimeout);
        if (!res.headersSent) {
          log("Auth failed during long poll, responding with 500");
          res.status(500).send("Authentication failed");
        }
      });
  });

  // OAuth callback endpoint
  app.get(options.path, (req, res) => {
    const code = req.query.code;
    if (!code) {
      res.status(400).send("Error: No authorization code received");
      return;
    }

    authCode = code;
    log("Auth code received, resolving promise");
    authCompletedResolve(code);

    res.send(
      "Authorization successful! You may close this window and return to the CLI.",
    );

    // Notify main flow that auth code is available
    options.events.emit("auth-code-received", code);
  });

  const server = app.listen(options.port, "127.0.0.1", () => {
    log(`OAuth callback server running at http://127.0.0.1:${options.port}`);
  });

  const waitForAuthCode = (): Promise<string> => {
    return new Promise((resolve) => {
      if (authCode) {
        resolve(authCode);
        return;
      }

      options.events.once("auth-code-received", (code) => {
        resolve(code);
      });
    });
  };

  return { server, authCode, waitForAuthCode, authCompletedPromise };
}

/**
 * Finds an available port on the local machine
 * @param serverOrPort A server instance or preferred port number to try first
 * @returns A promise that resolves to an available port number
 */
export function findAvailablePort(
  serverOrPort?: number | net.Server,
): Promise<number> {
  // Handle if server parameter is a number (preferred port)
  const preferredPort = typeof serverOrPort === "number"
    ? serverOrPort
    : undefined;
  const serverToUse = typeof serverOrPort !== "number"
    ? (serverOrPort as net.Server)
    : net.createServer();
  let hasResolved = false;

  // Maximum number of port attempts before giving up
  const MAX_PORT_ATTEMPTS = 10;
  let portAttempts = 0;
  let currentPort = preferredPort || AVAILABLE_PORT_START;
  let timeoutId: number | undefined;

  return new Promise((resolve, reject) => {
    // Make sure to close the server in case of errors
    const cleanupAndReject = (err: Error) => {
      if (!hasResolved) {
        hasResolved = true;
        // Clear the timeout to prevent leaks
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        // Make sure to close the server if we created it
        if (typeof serverOrPort === "number") {
          serverToUse.close(() => {
            reject(err);
          });
        } else {
          reject(err);
        }
      }
    };

    // Set a timeout to prevent hanging
    timeoutId = setTimeout(() => {
      if (!hasResolved) {
        cleanupAndReject(new Error("Timeout finding available port"));
      }
    }, 5000) as unknown as number;

    const tryNextPort = () => {
      if (portAttempts >= MAX_PORT_ATTEMPTS) {
        cleanupAndReject(new Error("Timeout finding available port"));
        return;
      }

      portAttempts++;

      try {
        serverToUse.listen({ port: currentPort, hostname: "127.0.0.1" });
      } catch (err) {
        // This catch block is mainly for tests since in real network operations,
        // errors are emitted as events
        const error = err as Error & { code?: string };
        if (error.code === "EADDRINUSE") {
          currentPort++;
          tryNextPort();
        } else {
          cleanupAndReject(error);
        }
      }
    };

    serverToUse.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        // If port is in use, try the next port
        currentPort++;
        tryNextPort();
      } else {
        cleanupAndReject(err);
      }
    });

    serverToUse.on("listening", () => {
      const { port } = serverToUse.address() as net.AddressInfo;
      hasResolved = true;

      // Clear the timeout to prevent leaks
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }

      // Close the server and then resolve with the port
      serverToUse.close(() => {
        resolve(port);
      });
    });

    // Try preferred port first, or get a random port
    tryNextPort();
  });
}

/**
 * Parses command line arguments for MCP clients and proxies
 * @param args Command line arguments
 * @param defaultPort Default port for the callback server if specified port is unavailable
 * @param usage Usage message to show on error
 * @returns A promise that resolves to an object with parsed serverUrl, callbackPort and headers
 */
export async function parseCommandLineArgs(
  args: string[],
  defaultPort: number,
  usage: string,
) {
  // Check for help flag
  if (args.includes("--help") || args.includes("-h")) {
    log(usage);
    Deno.exit(0);
  }

  // Process headers
  const headers: Record<string, string> = {};
  args.forEach((arg, i) => {
    if (arg === "--header" && i < args.length - 1) {
      const value = args[i + 1];
      const match = value.match(/^([A-Za-z0-9_-]+):(.*)$/);
      if (match) {
        headers[match[1]] = match[2];
      } else {
        log(`Warning: ignoring invalid header argument: ${value}`);
      }
      args.splice(i, 2);
    }
  });

  const serverUrl = args[0];
  const specifiedPort = args[1] ? Number.parseInt(args[1], 10) : undefined;
  const allowHttp = args.includes("--allow-http");

  if (!serverUrl) {
    log("Error: Server URL is required");
    log(usage);
    throw new Error("Process exit called");
  }

  try {
    const url = new URL(serverUrl);
    const isLocalhost =
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      url.protocol === "http:";

    if (!(url.protocol === "https:" || isLocalhost || allowHttp)) {
      log(
        "Error: Non-HTTPS URLs are only allowed for localhost or when --allow-http flag is provided",
      );
      log(usage);
      throw new Error("Process exit called");
    }
  } catch (error) {
    if (error instanceof TypeError) {
      log(`Error: Invalid URL format: ${serverUrl}`);
      log(usage);
      throw new Error("Process exit called");
    }
    throw error;
  }

  if (specifiedPort !== undefined && Number.isNaN(specifiedPort)) {
    log(`Error: Invalid port number: ${args[1]}`);
    log(usage);
    throw new Error("Process exit called");
  }

  // Use the specified port, or find an available one
  const callbackPort = specifiedPort || await findAvailablePort(defaultPort);

  if (specifiedPort) {
    log(`Using specified callback port: ${callbackPort}`);
  } else {
    log(`Using automatically selected callback port: ${callbackPort}`);
  }

  if (Object.keys(headers).length > 0) {
    log(`Using custom headers: ${JSON.stringify(headers)}`);
  }
  // Replace environment variables in headers
  // example `Authorization: Bearer ${TOKEN}` will read process.env.TOKEN
  for (const [key, value] of Object.entries(headers)) {
    headers[key] = value.replace(/\$\{([^}]+)}/g, (match, envVarName) => {
      const envVarValue = Deno.env.get(envVarName);

      if (envVarValue !== undefined) {
        log(`Replacing ${match} with environment value in header '${key}'`);
        return envVarValue;
      }

      log(
        `Warning: Environment variable '${envVarName}' not found for header '${key}'.`,
      );
      return "";
    });
  }

  return { serverUrl, callbackPort, headers };
}

/**
 * Sets up signal handlers for graceful shutdown
 * @param cleanup Cleanup function to run on shutdown
 */
export function setupSignalHandlers(cleanup: () => Promise<void>) {
  Deno.addSignalListener("SIGINT", async () => {
    log("\nShutting down...");
    await cleanup();
    Deno.exit(0);
  });

  // For SIGTERM
  try {
    Deno.addSignalListener("SIGTERM", async () => {
      log("\nReceived SIGTERM. Shutting down...");
      await cleanup();
      Deno.exit(0);
    });
  } catch (_e) {
    // SIGTERM might not be available on all platforms
    log("SIGTERM handler not available on this platform");
  }
}

/**
 * Generates a hash for the server URL to use in filenames
 * @param serverUrl The server URL to hash
 * @returns The hashed server URL
 */
export function getServerUrlHash(serverUrl: string): string {
  return crypto.createHash("md5").update(serverUrl).digest("hex");
}

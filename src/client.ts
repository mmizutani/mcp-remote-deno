#!/usr/bin/env node

/**
 * MCP Client with OAuth support
 * A command-line client that connects to an MCP server using SSE with OAuth authentication.
 *
 * Run with: deno run --allow-net --allow-env --allow-read --allow-run --allow-sys --allow-ffi src/client.ts https://example.remote/server [callback-port]
 *
 * If callback-port is not specified, an available port will be automatically selected.
 */

import { EventEmitter } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  ListResourcesResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { NodeOAuthClientProvider } from "./lib/node-oauth-client-provider.ts";
import {
  getServerUrlHash,
  log,
  MCP_REMOTE_VERSION,
  parseCommandLineArgs,
  setupSignalHandlers,
} from "./lib/utils.ts";
import { coordinateAuth } from "./lib/coordination.ts";

/**
 * Main function to run the client
 * @param serverUrl The URL of the remote MCP server to connect to
 * @param callbackPort The port to use for OAuth callback server
 * @param headers Custom HTTP headers to send with requests to the remote server
 */
async function runClient(
  serverUrl: string,
  callbackPort: number,
  headers: Record<string, string>,
) {
  // Set up event emitter for auth flow
  const events = new EventEmitter();

  // Get the server URL hash for lockfile operations
  const serverUrlHash = getServerUrlHash(serverUrl);

  // Coordinate authentication with other instances
  const { server, waitForAuthCode, skipBrowserAuth } = await coordinateAuth(
    serverUrlHash,
    callbackPort,
    events,
  );

  // Create the OAuth client provider
  const authProvider = new NodeOAuthClientProvider({
    serverUrl,
    callbackPort,
    clientName: "MCP CLI Client",
  });

  // If auth was completed by another instance, just log that we'll use the auth from disk
  if (skipBrowserAuth) {
    log(
      "Authentication was completed by another instance - will use tokens from disk...",
    );
    // TODO: remove, the callback is happening before the tokens are exchanged
    //  so we're slightly too early
    await new Promise((res) => setTimeout(res, 1_000));
  }

  // Create the client
  const client = new Client(
    {
      name: "mcp-remote",
      version: MCP_REMOTE_VERSION,
    },
    {
      capabilities: {},
    },
  );

  // Create the transport factory
  const url = new URL(serverUrl);
  function initTransport() {
    const transport = new SSEClientTransport(url, {
      authProvider,
      requestInit: { headers },
    });

    // Set up message and error handlers
    transport.onmessage = (message) => {
      log("Received message:", JSON.stringify(message, null, 2));
    };

    transport.onerror = (error) => {
      log("Transport error:", error);
    };

    transport.onclose = () => {
      log("Connection closed.");
      Deno.exit(0);
    };
    return transport;
  }

  const transport = initTransport();

  // Set up cleanup handler
  const cleanup = async () => {
    log("\nClosing connection...");
    await client.close();
    server.close();
  };
  setupSignalHandlers(cleanup);

  // Try to connect
  try {
    log("Connecting to server...");
    await client.connect(transport);
    log("Connected successfully!");
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.message.includes("Unauthorized"))
    ) {
      log("Authentication required. Waiting for authorization...");

      // Wait for the authorization code from the callback or another instance
      const code = await waitForAuthCode();

      try {
        log("Completing authorization...");
        await transport.finishAuth(code);

        // Reconnect after authorization with a new transport
        log("Connecting after authorization...");
        await client.connect(initTransport());

        log("Connected successfully!");

        // Request tools list after auth
        log("Requesting tools list...");
        const tools = await client.request(
          { method: "tools/list" },
          ListToolsResultSchema,
        );
        log("Tools:", JSON.stringify(tools, null, 2));

        // Request resources list after auth
        log("Requesting resource list...");
        const resources = await client.request(
          { method: "resources/list" },
          ListResourcesResultSchema,
        );
        log("Resources:", JSON.stringify(resources, null, 2));

        log("Listening for messages. Press Ctrl+C to exit.");
      } catch (authError) {
        log("Authorization error:", authError);
        server.close();
        Deno.exit(1);
      }
    } else {
      log("Connection error:", error);
      server.close();
      Deno.exit(1);
    }
  }

  try {
    // Request tools list
    log("Requesting tools list...");
    const tools = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema,
    );
    log("Tools:", JSON.stringify(tools, null, 2));
  } catch (e) {
    log("Error requesting tools list:", e);
  }

  try {
    // Request resources list
    log("Requesting resource list...");
    const resources = await client.request(
      { method: "resources/list" },
      ListResourcesResultSchema,
    );
    log("Resources:", JSON.stringify(resources, null, 2));
  } catch (e) {
    log("Error requesting resources list:", e);
  }

  log("Listening for messages. Press Ctrl+C to exit.");
}

// Parse command-line arguments and run the client
parseCommandLineArgs(
  Deno.args,
  3333,
  "Usage: deno run src/client.ts <https://server-url> [callback-port]",
)
  .then(({ serverUrl, callbackPort, headers }) => {
    return runClient(serverUrl, callbackPort, headers);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    Deno.exit(1);
  });

#!/usr/bin/env node

/**
 * This module implements a bidirectional proxy between local STDIO-based MCP clients and remote HTTP+SSE MCP servers.
 * It handles the complete OAuth 2.1 authentication flow, including PKCE, token management, and secure credential storage.
 *
 * The proxy translates between different MCP transport protocols, allowing applications like Claude Desktop and Cursor
 * that only support local STDIO connections to communicate with remote MCP servers that use HTTP+SSE transport.
 *
 * @example
 * ```ts
 * import { runProxy } from "@mmizutani/mcp-remote-deno";
 *
 * // Connect to a remote MCP server with optional headers
 * await runProxy(
 *   "https://remote.mcp.server.example.com/sse",
 *   3334,
 *   { "Authorization": "Bearer token" }
 * );
 * ```
 *
 * @module
 */

/**
 * MCP Proxy with OAuth support
 * A bidirectional proxy between a local STDIO MCP server and a remote SSE server with OAuth authentication.
 *
 * Run with: deno run --allow-net --allow-env --allow-read --allow-run src/proxy.ts https://example.remote/server [callback-port]
 *
 * If callback-port is not specified, an available port will be automatically selected.
 */

import { EventEmitter } from "node:events";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  connectToRemoteServer,
  getServerUrlHash,
  log,
  mcpProxy,
  parseCommandLineArgs,
  setupSignalHandlers,
} from "./lib/utils.ts";
import { NodeOAuthClientProvider } from "./lib/node-oauth-client-provider.ts";
import { coordinateAuth } from "./lib/coordination.ts";

/**
 * Runs the MCP proxy server that bridges local STDIO MCP clients to remote HTTP+SSE MCP servers
 *
 * This function sets up the complete bidirectional proxy, handling OAuth authentication, token management,
 * and the translation between different MCP transport protocols. It will automatically open a browser
 * for authentication if needed, or reuse existing credentials if available.
 *
 * @param serverUrl The URL of the remote MCP server to connect to (e.g., "https://example.com/sse")
 * @param callbackPort The local port to use for OAuth callback server (default: 3334). This port must be available
 *                     for the OAuth redirect URL during the authentication flow
 * @param headers Custom HTTP headers to send with requests to the remote server. This can be used to pass
 *                API keys or other authentication tokens when not using OAuth
 * @returns A Promise that resolves when the proxy is closed or rejects if an error occurs during setup
 *
 * @example
 * ```ts
 * // Basic usage with default settings
 * await runProxy("https://remote.mcp.server.example.com/sse", 3334, {});
 *
 * // With custom headers for API key authentication
 * await runProxy(
 *   "https://remote.mcp.server.example.com/sse",
 *   3334,
 *   { "X-Api-Key": "your-api-key" }
 * );
 * ```
 */
async function runProxy(
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
    clientName: "MCP CLI Proxy",
  });

  // If auth was completed by another instance, just log that we'll use the auth from disk
  if (skipBrowserAuth) {
    log(
      "Authentication was completed by another instance - will use tokens from disk",
    );
    // TODO: remove, the callback is happening before the tokens are exchanged
    //  so we're slightly too early
    await new Promise((res) => setTimeout(res, 1_000));
  }

  // Create the STDIO transport for local connections
  const localTransport = new StdioServerTransport();

  try {
    // Connect to remote server with authentication
    const remoteTransport = await connectToRemoteServer(
      serverUrl,
      authProvider,
      headers,
      waitForAuthCode,
      skipBrowserAuth,
    );

    // Set up bidirectional proxy between local and remote transports
    mcpProxy({
      transportToClient: localTransport,
      transportToServer: remoteTransport,
    });

    // Start the local STDIO server
    await localTransport.start();
    log("Local STDIO server running");
    log("Proxy established successfully between local STDIO and remote SSE");
    log("Press Ctrl+C to exit");

    // Setup cleanup handler
    const cleanup = async () => {
      await remoteTransport.close();
      await localTransport.close();
      server.close();
    };
    setupSignalHandlers(cleanup);
  } catch (error) {
    log("Fatal error:", error);
    if (
      error instanceof Error &&
      error.message.includes("self-signed certificate in certificate chain")
    ) {
      log(`You may be behind a VPN!

If you are behind a VPN, you can try setting the DENO_CERT environment variable to point
to the CA certificate file. If using claude_desktop_config.json, this might look like:

{
  "mcpServers": {
    "\${mcpServerName}": {
      "command": "deno",
      "args": [
        "run",
        "--allow-env",
        "--allow-read",
        "--allow-sys=homedir",
        "--allow-run=open",
        "--allow-write=\"$HOME/.mcp-auth\"",
        "--allow-net=0.0.0.0,127.0.0.1,localhost",
        "jsr:@mmizutani/mcp-remote-deno",
        "https://remote.mcp.server.example.com/sse"
      ],
      "env": {
        "DENO_CERT": "\${your CA certificate file path}.pem"
      }
    }
  }
}
        `);
    }
    server.close();
    Deno.exit(1);
  }
}

// Parse command-line arguments and run the proxy
parseCommandLineArgs(
  Deno.args,
  3334,
  "Usage: deno run src/proxy.ts <https://server-url> [callback-port]",
)
  .then(({ serverUrl, callbackPort, headers }) => {
    return runProxy(serverUrl, callbackPort, headers);
  })
  .catch((error) => {
    log("Fatal error:", error);
    Deno.exit(1);
  });

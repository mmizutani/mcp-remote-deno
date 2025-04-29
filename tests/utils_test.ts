import { assertEquals, assertMatch, assertRejects } from "std/assert/mod.ts";
import {
  getServerUrlHash,
  log,
  MCP_REMOTE_VERSION,
  findAvailablePort,
  mcpProxy,
  setupSignalHandlers,
  parseCommandLineArgs
} from "../src/lib/utils.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import { assertSpyCalls, spy, type MethodSpy } from "std/testing/mock.ts";
import { EventEmitter } from "node:events";
import net from "node:net";
import type { Transport } from "npm:@modelcontextprotocol/sdk/shared/transport.js";

// Define mock server type
interface MockServer {
  listen: (port: number, callback: () => void) => MockServer;
  close: (callback: () => void) => MockServer;
  on: (event: string, callback: () => void) => MockServer;
}

describe("utils", () => {
  describe("getServerUrlHash", () => {
    it("returns a hexadecimal hash of server URL", () => {
      const serverUrl = "https://api.example.com";
      const hash = getServerUrlHash(serverUrl);

      // Hash should be 32 characters long (MD5)
      assertEquals(hash.length, 32);
      // Should only contain hexadecimal characters
      assertMatch(hash, /^[0-9a-f]{32}$/);

      // Test consistency - should return same hash for same URL
      const hash2 = getServerUrlHash(serverUrl);
      assertEquals(hash, hash2);

      // Test different URLs produce different hashes
      const differentUrl = "https://different.example.com";
      const differentHash = getServerUrlHash(differentUrl);
      assertEquals(differentHash.length, 32);
      assertMatch(differentHash, /^[0-9a-f]{32}$/);

      // Different URLs should produce different hashes
      assertEquals(hash !== differentHash, true);
    });
  });

  describe("log", () => {
    let consoleErrorSpy: MethodSpy<Console, unknown[], void>;

    beforeEach(() => {
      // Spy on console.error
      consoleErrorSpy = spy(console, "error");
    });

    afterEach(() => {
      // Restore original console.error
      consoleErrorSpy.restore();
    });

    it("logs message with process ID", () => {
      const message = "Test message";
      log(message);

      // Console.error should be called once
      assertSpyCalls(consoleErrorSpy, 1);

      // The log message should include the process ID and our message
      const call = consoleErrorSpy.calls[0];
      assertEquals(call.args.length, 1);
      assertMatch(call.args[0] as string, /^\[\d+\] Test message$/);
    });

    it("logs additional parameters", () => {
      const message = "Test message";
      const additionalParam = { test: "value" };
      log(message, additionalParam);

      assertSpyCalls(consoleErrorSpy, 1);

      const call = consoleErrorSpy.calls[0];
      assertEquals(call.args.length, 2);
      assertMatch(call.args[0] as string, /^\[\d+\] Test message$/);
      assertEquals(call.args[1], additionalParam);
    });
  });

  describe("MCP_REMOTE_VERSION", () => {
    it("should be a valid semver version", () => {
      assertMatch(MCP_REMOTE_VERSION, /^\d+\.\d+\.\d+$/);
    });
  });

  describe("findAvailablePort", () => {
    let originalNetCreateServer: typeof net.createServer;
    let serverListenSpy: MethodSpy<MockServer, [port: number, callback: () => void], MockServer>;
    let serverCloseSpy: MethodSpy<MockServer, [callback: () => void], MockServer>;

    beforeEach(() => {
      // Mock server behavior
      originalNetCreateServer = net.createServer;

      // Mock a server object
      const mockServer: MockServer = {
        listen: (port: number, callback: () => void) => {
          // Call the callback to simulate server starting
          callback();
          return mockServer;
        },
        close: (callback: () => void) => {
          // Call the callback to simulate server closing
          callback();
          return mockServer;
        },
        on: (_event: string, _callback: () => void) => {
          return mockServer;
        },
      };

      // Create spies on the mock server methods
      serverListenSpy = spy(mockServer, "listen");
      serverCloseSpy = spy(mockServer, "close");

      // Mock the net.createServer
      net.createServer = () => mockServer as unknown as net.Server;
    });

    afterEach(() => {
      // Restore original net.createServer
      net.createServer = originalNetCreateServer;

      // Clean up spies
      serverListenSpy.restore();
      serverCloseSpy.restore();
    });

    it("finds an available port using the preferred port when it's available", async () => {
      const preferredPort = 8080;
      const port = await findAvailablePort(preferredPort);

      assertEquals(port, preferredPort);
      assertSpyCalls(serverListenSpy, 1);
      assertSpyCalls(serverCloseSpy, 1);
    });

    it("finds an available port automatically when no preference is given", async () => {
      const port = await findAvailablePort();

      assertEquals(typeof port, "number");
      assertSpyCalls(serverListenSpy, 1);
      assertSpyCalls(serverCloseSpy, 1);
    });
  });

  describe("parseCommandLineArgs", () => {
    it("parses valid arguments", async () => {
      const args = ["--server", "https://example.com", "--port", "8080"];
      const defaultPort = 3000;
      const usage = "Usage: mcp-remote --server <url> [--port <port>]";

      const result = await parseCommandLineArgs(args, defaultPort, usage);

      assertEquals(result.serverUrl, "https://example.com");
      assertEquals(result.callbackPort, 8080);
    });

    it("uses default port if not specified", async () => {
      const args = ["--server", "https://example.com"];
      const defaultPort = 3000;
      const usage = "Usage: mcp-remote --server <url> [--port <port>]";

      const result = await parseCommandLineArgs(args, defaultPort, usage);

      assertEquals(result.serverUrl, "https://example.com");
      assertEquals(result.callbackPort, defaultPort);
    });

    it("enforces required server URL", async () => {
      const args: string[] = [];
      const defaultPort = 3000;
      const usage = "Usage: mcp-remote --server <url> [--port <port>]";

      await assertRejects(
        async () => {
          await parseCommandLineArgs(args, defaultPort, usage);
        },
        Error,
        "Server URL is required"
      );
    });

    it("handles format errors in server URL", async () => {
      const args = ["--server", "not-a-url"];
      const defaultPort = 3000;
      const usage = "Usage: mcp-remote --server <url> [--port <port>]";

      await assertRejects(
        async () => {
          await parseCommandLineArgs(args, defaultPort, usage);
        },
        Error
      );
    });

    it("handles invalid port numbers", async () => {
      const args = ["--server", "https://example.com", "--port", "invalid"];
      const defaultPort = 3000;
      const usage = "Usage: mcp-remote --server <url> [--port <port>]";

      await assertRejects(
        async () => {
          await parseCommandLineArgs(args, defaultPort, usage);
        },
        Error
      );
    });
  });

  describe("setupSignalHandlers", () => {
    it("sets up handlers for SIGINT and SIGTERM", () => {
      // Create spies for process.on
      const processSpy = spy(Deno, "addSignalListener");

      // Mock cleanup function
      const cleanup = spy(() => Promise.resolve());

      // Call the function
      setupSignalHandlers(cleanup);

      // Verify signal handlers are set
      assertSpyCalls(processSpy, 2);
      assertEquals(processSpy.calls[0].args[0], "SIGINT");
      assertEquals(typeof processSpy.calls[0].args[1], "function");
      assertEquals(processSpy.calls[1].args[0], "SIGTERM");
      assertEquals(typeof processSpy.calls[1].args[1], "function");

      // Restore spy
      processSpy.restore();
    });
  });
});

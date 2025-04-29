import { assertEquals, assertMatch, assertRejects } from "std/assert/mod.ts";
import {
  getServerUrlHash,
  log,
  MCP_REMOTE_VERSION,
  findAvailablePort,
  setupSignalHandlers,
  parseCommandLineArgs,
  AVAILABLE_PORT_START,
} from "../src/lib/utils.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import { assertSpyCalls, spy, type MethodSpy } from "std/testing/mock.ts";
import type net from "node:net";
import type { Transport } from "npm:@modelcontextprotocol/sdk/shared/transport.js";
import type process from "node:process";

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
    let mockServer: MockServer;
    let listenSpy: MethodSpy<MockServer, [port: number, callback: () => void], MockServer>;
    let closeSpy: MethodSpy<MockServer, [callback: () => void], MockServer>;

    beforeEach(() => {
      // Create a proper mock server that correctly handles callbacks
      mockServer = {
        listen: (_port: number, callback: () => void) => {
          // Properly invoke callback
          if (typeof callback === 'function') {
            callback();
          }
          return mockServer;
        },
        close: (callback: () => void) => {
          // Properly invoke callback
          if (typeof callback === 'function') {
            callback();
          }
          return mockServer;
        },
        on: (_event: string, _callback: () => void) => {
          return mockServer;
        }
      };

      // Create properly typed spies
      listenSpy = spy(mockServer, "listen");
      closeSpy = spy(mockServer, "close");
    });

    afterEach(() => {
      // Restore original methods
      listenSpy.restore();
      closeSpy.restore();
    });

    it("returns the first available port", async () => {
      const port = await findAvailablePort(mockServer as unknown as net.Server);

      // Verify listen was called with the correct starting port
      assertSpyCalls(listenSpy, 1);
      const listenCall = listenSpy.calls[0];
      assertEquals(listenCall.args[0], AVAILABLE_PORT_START);

      // Verify the server was closed
      assertSpyCalls(closeSpy, 1);

      // Port should be at least the starting port
      assertEquals(port, AVAILABLE_PORT_START);
    });

    it("increments port if initial port is unavailable", async () => {
      // Reset spies
      listenSpy.restore();
      closeSpy.restore();

      // Create a mock that fails on first port but succeeds on second
      let callCount = 0;
      mockServer.listen = (_port: number, callback: () => void) => {
        callCount++;
        if (callCount === 1) {
          // First call should fail with EADDRINUSE
          const error = new Error("Address in use") as Error & { code?: string };
          error.code = "EADDRINUSE";
          throw error;
        }

        // Second call should succeed
        if (typeof callback === 'function') {
          callback();
        }
        return mockServer;
      };

      // Re-create spies
      listenSpy = spy(mockServer, "listen");
      closeSpy = spy(mockServer, "close");

      const port = await findAvailablePort(mockServer as unknown as net.Server);

      // Verify listen was called twice, first with starting port, then with incremented port
      assertSpyCalls(listenSpy, 2);
      assertEquals(listenSpy.calls[0].args[0], AVAILABLE_PORT_START);
      assertEquals(listenSpy.calls[1].args[0], AVAILABLE_PORT_START + 1);

      // Verify the server was closed
      assertSpyCalls(closeSpy, 1);

      // Port should be the incremented value
      assertEquals(port, AVAILABLE_PORT_START + 1);
    });

    it("throws after MAX_PORT_ATTEMPTS", async () => {
      // Create a mock that always fails with EADDRINUSE
      mockServer.listen = (_port: number, _callback: () => void) => {
        const error = new Error("Address in use") as Error & { code?: string };
        error.code = "EADDRINUSE";
        throw error;
      };

      // Should now throw a timeout instead of port attempts limit
      await assertRejects(
        () => findAvailablePort(mockServer as unknown as net.Server),
        Error,
        "Timeout finding available port"
      );
    });
  });

  describe("parseCommandLineArgs", () => {
    // Mock the minimist function to avoid actual command line parsing
    let originalProcess: typeof process;

    beforeEach(() => {
      // Save original process
      originalProcess = globalThis.process;

      // Create a mock process object
      globalThis.process = {
        ...originalProcess,
        exit: (_code?: number) => {
          throw new Error("Process exit called");
        },
      } as typeof process;
    });

    afterEach(() => {
      // Restore original process
      globalThis.process = originalProcess;
    });

    it("parses valid arguments", async () => {
      const args = ["https://example.com", "8080"];
      const defaultPort = 3000;
      const usage = "Usage: mcp-remote <url> [port]";

      const result = await parseCommandLineArgs(args, defaultPort, usage);

      assertEquals(result.serverUrl, "https://example.com");
      assertEquals(result.callbackPort, 8080);
    });

    it("uses default port if not specified", async () => {
      const args = ["https://example.com"];
      const defaultPort = 3000;
      const usage = "Usage: mcp-remote <url> [port]";

      const result = await parseCommandLineArgs(args, defaultPort, usage);

      assertEquals(result.serverUrl, "https://example.com");
      assertEquals(result.callbackPort, defaultPort);
    });

    it("enforces required server URL", async () => {
      const args: string[] = [];
      const defaultPort = 3000;
      const usage = "Usage: mcp-remote <url> [port]";

      await assertRejects(
        async () => {
          await parseCommandLineArgs(args, defaultPort, usage);
        },
        Error,
        "Process exit called"
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

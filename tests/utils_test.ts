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
import type process from "node:process";

// Define global interface to extend globalThis type
interface GlobalWithFindPort {
  findAvailablePort: (port: number) => Promise<number>;
}

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
      // Mock the server address method to return the expected port
      (mockServer as unknown as { address(): { port: number } }).address = () => ({ port: AVAILABLE_PORT_START });

      // Mock event handlers
      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};
      mockServer.on = (event: string, callback: () => void) => {
        if (!eventHandlers[event]) {
          eventHandlers[event] = [];
        }
        eventHandlers[event].push(callback);
        return mockServer;
      };

      const originalListen = mockServer.listen;
      mockServer.listen = (port: number, callback: () => void) => {
        const result = originalListen(port, callback);
        // Simulate a successful listening event
        if (eventHandlers.listening) {
          for (const handler of eventHandlers.listening) {
            handler();
          }
        }
        return result;
      };

      const port = await findAvailablePort(mockServer as unknown as net.Server);

      // Port should be the expected port
      assertEquals(port, AVAILABLE_PORT_START);
    });

    it("increments port if initial port is unavailable", async () => {
      // Mock the server address method to return the incremented port
      (mockServer as unknown as { address(): { port: number } }).address = () => ({ port: AVAILABLE_PORT_START + 1 });

      // Mock event handlers
      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};
      mockServer.on = (event: string, callback: (...args: unknown[]) => void) => {
        if (!eventHandlers[event]) {
          eventHandlers[event] = [];
        }
        eventHandlers[event].push(callback);
        return mockServer;
      };

      let callCount = 0;
      const originalListen = mockServer.listen;
      mockServer.listen = (port: number, callback: () => void) => {
        callCount++;
        if (callCount === 1) {
          // First call should fail with EADDRINUSE
          if (eventHandlers.error) {
            const error = new Error("Address in use") as Error & { code?: string };
            error.code = "EADDRINUSE";
            for (const handler of eventHandlers.error) {
              handler(error);
            }
          }
          return mockServer;
        }

        // Second call should succeed
        const result = originalListen(port, callback);
        if (eventHandlers.listening) {
          for (const handler of eventHandlers.listening) {
            handler();
          }
        }
        return result;
      };

      const port = await findAvailablePort(mockServer as unknown as net.Server);

      // Port should be the incremented value
      assertEquals(port, AVAILABLE_PORT_START + 1);
    });

    it("throws after MAX_PORT_ATTEMPTS", async () => {
      // Mock event handlers
      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};
      mockServer.on = (event: string, callback: (...args: unknown[]) => void) => {
        if (!eventHandlers[event]) {
          eventHandlers[event] = [];
        }
        eventHandlers[event].push(callback);
        return mockServer;
      };

      // Always trigger error event with EADDRINUSE
      mockServer.listen = (_port: number, _callback: () => void) => {
        if (eventHandlers.error) {
          const error = new Error("Address in use") as Error & { code?: string };
          error.code = "EADDRINUSE";
          for (const handler of eventHandlers.error) {
            handler(error);
          }
        }
        return mockServer;
      };

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
    let originalFindAvailablePort: typeof findAvailablePort;

    beforeEach(() => {
      // Save original process and findAvailablePort
      originalProcess = globalThis.process;
      originalFindAvailablePort = findAvailablePort;

      // Mock findAvailablePort to avoid network access
      (globalThis as unknown as GlobalWithFindPort).findAvailablePort = (port: number) => Promise.resolve(port);

      // Create a mock process object
      globalThis.process = {
        ...originalProcess,
        exit: (_code?: number) => {
          throw new Error("Process exit called");
        },
      } as typeof process;
    });

    afterEach(() => {
      // Restore original process and findAvailablePort
      globalThis.process = originalProcess;
      (globalThis as unknown as GlobalWithFindPort).findAvailablePort = originalFindAvailablePort;
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
      // Mock findAvailablePort specifically for this test
      const mockFindPort = spy(() => Promise.resolve(3000));
      // Replace the global findAvailablePort with our mock
      (globalThis as unknown as GlobalWithFindPort).findAvailablePort = mockFindPort;

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
      // Create a spy for Deno.addSignalListener
      const addSignalListenerSpy = spy(Deno, "addSignalListener");

      // Save the original method to restore it later
      const originalAddSignalListener = Deno.addSignalListener;

      // Mock the signal handler to avoid actual handlers being registered
      const registeredHandlers: Record<string, Array<() => void>> = {};
      Deno.addSignalListener = ((signal: string, handler: () => void) => {
        if (!registeredHandlers[signal]) {
          registeredHandlers[signal] = [];
        }
        registeredHandlers[signal].push(handler);
      }) as typeof Deno.addSignalListener;

      // Mock cleanup function
      const cleanup = spy(() => Promise.resolve());

      // Call the function
      setupSignalHandlers(cleanup);

      // Verify appropriate signals were attempted to be registered
      assertEquals(Object.keys(registeredHandlers).length, 2);
      assertEquals(registeredHandlers.SIGINT?.length, 1);
      assertEquals(registeredHandlers.SIGTERM?.length, 1);

      // Restore original method to prevent leaks
      Deno.addSignalListener = originalAddSignalListener;

      // Restore spy
      addSignalListenerSpy.restore();
    });
  });
});

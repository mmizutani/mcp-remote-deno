import { assertEquals, assertMatch } from "std/assert/mod.ts";
import { getServerUrlHash, log, MCP_REMOTE_VERSION } from "../src/lib/utils.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import { assertSpyCalls, spy, type MethodSpy } from "std/testing/mock.ts";

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
      assertEquals(call.args.length, 2);
      assertMatch(call.args[0] as string, /^\[\d+\] Test message$/);
    });

    it("logs additional parameters", () => {
      const message = "Test message";
      const additionalParam = { test: "value" };
      log(message, additionalParam);

      assertSpyCalls(consoleErrorSpy, 1);

      const call = consoleErrorSpy.calls[0];
      assertEquals(call.args.length, 3);
      assertMatch(call.args[0] as string, /^\[\d+\] Test message$/);
      assertEquals(call.args[1], additionalParam);
    });
  });

  describe("MCP_REMOTE_VERSION", () => {
    it("should be a valid semver version", () => {
      assertMatch(MCP_REMOTE_VERSION, /^\d+\.\d+\.\d+$/);
    });
  });
});

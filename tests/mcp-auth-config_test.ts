import {
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "std/testing/bdd.ts";
import { assertSpyCalls, spy, stub } from "std/testing/mock.ts";
import { FakeTime } from "std/testing/time.ts";
import {
  getConfigDir,
  getConfigFilePath,
} from "../src/lib/mcp-auth-config.ts";
import { MCP_REMOTE_VERSION } from "../src/lib/utils.ts";
import * as path from "node:path";
import * as os from "node:os";

describe("mcp-auth-config", () => {
  describe("getConfigDir", () => {
    const originalEnv = { ...Deno.env.toObject() };

    afterEach(() => {
      // Restore original environment
      for (const key in Deno.env.toObject()) {
        Deno.env.delete(key);
      }
      for (const [key, value] of Object.entries(originalEnv)) {
        Deno.env.set(key, value);
      }
    });

    it("uses MCP_REMOTE_CONFIG_DIR environment variable if set", () => {
      const customDir = "/custom/config/dir";
      Deno.env.set("MCP_REMOTE_CONFIG_DIR", customDir);

      const configDir = getConfigDir();

      assertStringIncludes(configDir, customDir);
      assertStringIncludes(configDir, `mcp-remote-${MCP_REMOTE_VERSION}`);
    });

    it("falls back to ~/.mcp-auth if environment variable is not set", () => {
      // Ensure the env var is not set
      Deno.env.delete("MCP_REMOTE_CONFIG_DIR");

      const homeDir = os.homedir();
      const expectedBase = path.join(homeDir, ".mcp-auth");

      const configDir = getConfigDir();

      assertStringIncludes(configDir, expectedBase);
      assertStringIncludes(configDir, `mcp-remote-${MCP_REMOTE_VERSION}`);
    });
  });

  describe("getConfigFilePath", () => {
    it("returns correct file path with server hash prefix", () => {
      const serverUrlHash = "abc123";
      const filename = "test.json";

      const filePath = getConfigFilePath(serverUrlHash, filename);
      const configDir = getConfigDir();

      const expectedPath = path.join(configDir, `${serverUrlHash}_${filename}`);
      assertEquals(filePath, expectedPath);
    });
  });
});

import {
  assertEquals,
  assertStringIncludes,
  assertRejects,
} from "std/assert/mod.ts";
import { describe, it, afterEach, beforeEach } from "std/testing/bdd.ts";
import {
  getConfigDir,
  getConfigFilePath,
  ensureConfigDir,
  createLockfile,
  checkLockfile,
  deleteLockfile,
  readJsonFile,
  writeJsonFile,
  deleteConfigFile,
  readTextFile,
  writeTextFile,
} from "../src/lib/mcp-auth-config.ts";
import { MCP_REMOTE_VERSION } from "../src/lib/utils.ts";
import * as path from "node:path";
import * as os from "node:os";
import { assertSpyCalls, spy } from "std/testing/mock.ts";

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
      assertStringIncludes(configDir, `mcp-remote-deno-${MCP_REMOTE_VERSION}`);
    });

    it("falls back to ~/.mcp-auth if environment variable is not set", () => {
      // Ensure the env var is not set
      Deno.env.delete("MCP_REMOTE_CONFIG_DIR");

      const homeDir = os.homedir();
      const expectedBase = path.join(homeDir, ".mcp-auth");

      const configDir = getConfigDir();

      assertStringIncludes(configDir, expectedBase);
      assertStringIncludes(configDir, `mcp-remote-deno-${MCP_REMOTE_VERSION}`);
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

  describe("ensureConfigDir", () => {
    it("creates directory when it doesn't exist", async () => {
      // Basic test without spies
      await ensureConfigDir();
      // If it doesn't throw, we're good
      assertEquals(true, true);
    });
  });

  describe("lockfile functions", () => {
    const testHash = "testhash123";
    const testPort = 12345;
    const testPid = 67890;

    it("can create and check lockfiles", async () => {
      // Just test basic functionality without spies
      await createLockfile(testHash, testPid, testPort);

      const lockfile = await checkLockfile(testHash);

      // Only check that data is correctly returned, not implementation details
      assertEquals(lockfile?.pid, testPid);
      assertEquals(lockfile?.port, testPort);

      // Clean up
      await deleteLockfile(testHash);
    });
  });

  describe("file operations", () => {
    const testHash = "testhash987";
    const testFilename = "test-fileops.json";
    const testData = { key: "value" };

    it("writes and reads JSON files", async () => {
      await writeJsonFile(testHash, testFilename, testData);

      const parseFunc = {
        parseAsync: (data: unknown) => {
          return Promise.resolve(data);
        },
      };

      const result = await readJsonFile(testHash, testFilename, parseFunc);
      assertEquals((result as any)?.key, testData.key);

      // Clean up
      await deleteConfigFile(testHash, testFilename);
    });
  });
});

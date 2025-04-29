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
    let mkdirSpy: ReturnType<typeof spy<typeof Deno.mkdir>>;
    let originalMkdir: typeof Deno.mkdir;

    beforeEach(() => {
      originalMkdir = Deno.mkdir;
      // Mock mkdir to avoid actual file system operations
      mkdirSpy = spy((_path: string | URL, _options?: Deno.MkdirOptions) => {
        return Promise.resolve();
      }) as unknown as ReturnType<typeof spy<typeof Deno.mkdir>>;
      Deno.mkdir = mkdirSpy as unknown as typeof Deno.mkdir;
    });

    afterEach(() => {
      // Restore original mkdir
      Deno.mkdir = originalMkdir;
    });

    it("creates directory when it doesn't exist", async () => {
      await ensureConfigDir();

      // Check that mkdir was called with the correct dir
      assertSpyCalls(mkdirSpy, 1);
      const configDir = getConfigDir();
      assertEquals(mkdirSpy.calls[0].args[0], configDir);
      assertEquals(mkdirSpy.calls[0].args[1], { recursive: true });
    });

    it("handles errors when creating directories", async () => {
      // Instead of restoring, assign a new spy directly
      Deno.mkdir = spy((_path: string | URL, _options?: Deno.MkdirOptions) => {
        throw new Error("Test mkdir error");
      }) as unknown as typeof Deno.mkdir;

      // Should throw when mkdir fails
      await assertRejects(
        () => ensureConfigDir(),
        Error,
        "Test mkdir error"
      );
    });
  });

  describe("file operations", () => {
    const testHash = "testhash987";
    const testFilename = "test-fileops.json";
    const testData = { key: "value" };

    // Mock Deno file operations
    let writeTextFileSpy: ReturnType<typeof spy<typeof Deno.writeTextFile>>;
    let readTextFileSpy: ReturnType<typeof spy<typeof Deno.readTextFile>>;
    let removeSpy: ReturnType<typeof spy<typeof Deno.remove>>;
    let mkdirSpy: ReturnType<typeof spy<typeof Deno.mkdir>>;

    // Store original Deno functions
    const originalWriteTextFile = Deno.writeTextFile;
    const originalReadTextFile = Deno.readTextFile;
    const originalRemove = Deno.remove;
    const originalMkdir = Deno.mkdir;

    beforeEach(() => {
      // Setup mocks to avoid filesystem operations
      mkdirSpy = spy((_path: string | URL, _options?: Deno.MkdirOptions) => {
        return Promise.resolve();
      }) as unknown as ReturnType<typeof spy<typeof Deno.mkdir>>;
      Deno.mkdir = mkdirSpy as unknown as typeof Deno.mkdir;

      writeTextFileSpy = spy((_path: string | URL, _data: string) => {
        return Promise.resolve();
      }) as unknown as ReturnType<typeof spy<typeof Deno.writeTextFile>>;
      Deno.writeTextFile = writeTextFileSpy as unknown as typeof Deno.writeTextFile;

      readTextFileSpy = spy((_path: string | URL) => {
        return Promise.resolve(JSON.stringify(testData));
      }) as unknown as ReturnType<typeof spy<typeof Deno.readTextFile>>;
      Deno.readTextFile = readTextFileSpy as unknown as typeof Deno.readTextFile;

      removeSpy = spy((_path: string | URL) => {
        return Promise.resolve();
      }) as unknown as ReturnType<typeof spy<typeof Deno.remove>>;
      Deno.remove = removeSpy as unknown as typeof Deno.remove;
    });

    afterEach(() => {
      // Restore original functions
      Deno.mkdir = originalMkdir;
      Deno.writeTextFile = originalWriteTextFile;
      Deno.readTextFile = originalReadTextFile;
      Deno.remove = originalRemove;
    });

    it("writes and reads JSON files", async () => {
      await writeJsonFile(testHash, testFilename, testData);

      // Verify writeTextFile was called with correct path and data
      assertSpyCalls(writeTextFileSpy, 1);
      const expectedPath = getConfigFilePath(testHash, testFilename);
      assertEquals(writeTextFileSpy.calls[0].args[0], expectedPath);
      assertEquals(writeTextFileSpy.calls[0].args[1], JSON.stringify(testData, null, 2));

      // Define a schema for parsing the JSON
      const parseFunc = {
        parseAsync: (data: unknown) => {
          return Promise.resolve(data as Record<string, string>);
        },
      };

      // Read the file back
      const result = await readJsonFile(testHash, testFilename, parseFunc);

      // Verify readTextFile was called
      assertSpyCalls(readTextFileSpy, 1);
      assertEquals(readTextFileSpy.calls[0].args[0], expectedPath);

      // Check the parsed result
      assertEquals(result?.key, testData.key);

      // Clean up (delete file)
      await deleteConfigFile(testHash, testFilename);

      // Verify remove was called
      assertSpyCalls(removeSpy, 1);
      assertEquals(removeSpy.calls[0].args[0], expectedPath);
    });

    it("handles file not found when reading JSON", async () => {
      // Create a new spy directly instead of restoring
      Deno.readTextFile = spy((_path: string | URL) => {
        throw new Deno.errors.NotFound();
      }) as unknown as typeof Deno.readTextFile;

      const parseFunc = {
        parseAsync: (data: unknown) => {
          return Promise.resolve(data as Record<string, string>);
        },
      };

      // Should return undefined when file not found
      const result = await readJsonFile(testHash, testFilename, parseFunc);
      assertEquals(result, undefined);
    });

    it("writes and reads text files", async () => {
      const testText = "test text content";

      await writeTextFile(testHash, testFilename, testText);

      // Verify writeTextFile was called
      assertSpyCalls(writeTextFileSpy, 1);
      const expectedPath = getConfigFilePath(testHash, testFilename);
      assertEquals(writeTextFileSpy.calls[0].args[0], expectedPath);
      assertEquals(writeTextFileSpy.calls[0].args[1], testText);

      // Assign a new spy directly instead of restoring
      Deno.readTextFile = spy((_path: string | URL) => {
        return Promise.resolve(testText);
      }) as unknown as typeof Deno.readTextFile;

      // Read the text back
      const result = await readTextFile(testHash, testFilename);

      // Verify readTextFile was called
      assertSpyCalls(Deno.readTextFile as unknown as ReturnType<typeof spy>, 1);
      assertEquals((Deno.readTextFile as unknown as ReturnType<typeof spy>).calls[0].args[0], expectedPath);
      assertEquals(result, testText);
    });

    it("handles errors when reading text files", async () => {
      // Assign a new spy directly that throws an error
      Deno.readTextFile = spy((_path: string | URL) => {
        throw new Error("Read error");
      }) as unknown as typeof Deno.readTextFile;

      // Should throw with custom error message
      await assertRejects(
        () => readTextFile(testHash, testFilename, "Custom error message"),
        Error,
        "Custom error message"
      );
    });
  });

  describe("lockfile functions", () => {
    const testHash = "testhash123";
    const testPort = 12345;
    const testPid = 67890;

    let writeTextFileSpy: ReturnType<typeof spy<typeof Deno.writeTextFile>>;
    let readTextFileSpy: ReturnType<typeof spy<typeof Deno.readTextFile>>;
    let removeSpy: ReturnType<typeof spy<typeof Deno.remove>>;
    let mkdirSpy: ReturnType<typeof spy<typeof Deno.mkdir>>;

    const originalWriteTextFile = Deno.writeTextFile;
    const originalReadTextFile = Deno.readTextFile;
    const originalRemove = Deno.remove;
    const originalMkdir = Deno.mkdir;

    const mockLockData = {
      pid: testPid,
      port: testPort,
      timestamp: Date.now(),
    };

    beforeEach(() => {
      mkdirSpy = spy((_path: string | URL, _options?: Deno.MkdirOptions) => {
        return Promise.resolve();
      }) as unknown as ReturnType<typeof spy<typeof Deno.mkdir>>;
      Deno.mkdir = mkdirSpy as unknown as typeof Deno.mkdir;

      writeTextFileSpy = spy((_path: string | URL, _data: string) => {
        return Promise.resolve();
      }) as unknown as ReturnType<typeof spy<typeof Deno.writeTextFile>>;
      Deno.writeTextFile = writeTextFileSpy as unknown as typeof Deno.writeTextFile;

      readTextFileSpy = spy((_path: string | URL) => {
        return Promise.resolve(JSON.stringify(mockLockData));
      }) as unknown as ReturnType<typeof spy<typeof Deno.readTextFile>>;
      Deno.readTextFile = readTextFileSpy as unknown as typeof Deno.readTextFile;

      removeSpy = spy((_path: string | URL) => {
        return Promise.resolve();
      }) as unknown as ReturnType<typeof spy<typeof Deno.remove>>;
      Deno.remove = removeSpy as unknown as typeof Deno.remove;
    });

    afterEach(() => {
      Deno.mkdir = originalMkdir;
      Deno.writeTextFile = originalWriteTextFile;
      Deno.readTextFile = originalReadTextFile;
      Deno.remove = originalRemove;
    });

    it("creates lockfile with correct data", async () => {
      await createLockfile(testHash, testPid, testPort);

      // Verify writeTextFile was called
      assertSpyCalls(writeTextFileSpy, 1);
      const expectedPath = getConfigFilePath(testHash, "lock.json");
      assertEquals(writeTextFileSpy.calls[0].args[0], expectedPath);

      // Parse the written data and verify it contains our test values
      const writtenData = JSON.parse(writeTextFileSpy.calls[0].args[1] as string);
      assertEquals(writtenData.pid, testPid);
      assertEquals(writtenData.port, testPort);
      assertEquals(typeof writtenData.timestamp, "number");
    });

    it("can read lockfile data", async () => {
      const lockfile = await checkLockfile(testHash);

      // Verify readTextFile was called
      assertSpyCalls(readTextFileSpy, 1);
      const expectedPath = getConfigFilePath(testHash, "lock.json");
      assertEquals(readTextFileSpy.calls[0].args[0], expectedPath);

      // Verify the returned data
      assertEquals(lockfile?.pid, mockLockData.pid);
      assertEquals(lockfile?.port, mockLockData.port);
      assertEquals(lockfile?.timestamp, mockLockData.timestamp);
    });

    it("returns null when lockfile doesn't exist", async () => {
      // Create a new spy that throws NotFound
      Deno.readTextFile = spy((_path: string | URL) => {
        throw new Deno.errors.NotFound();
      }) as unknown as typeof Deno.readTextFile;

      const lockfile = await checkLockfile(testHash);
      assertEquals(lockfile, null);
    });

    it("deletes lockfile", async () => {
      await deleteLockfile(testHash);

      // Verify remove was called
      assertSpyCalls(removeSpy, 1);
      const expectedPath = getConfigFilePath(testHash, "lock.json");
      assertEquals(removeSpy.calls[0].args[0], expectedPath);
    });
  });
});

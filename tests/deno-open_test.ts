import { assertEquals, assertRejects } from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "std/testing/bdd.ts";
import { assertSpyCalls, spy, type Spy } from "std/testing/mock.ts";
import open from "../src/lib/deno-open.ts";

// Define the expected structure returned by the mocked Deno.Command
interface MockCommandOutput {
  spawn: () => { status: Promise<{ success: boolean; code: number }> };
}

describe("deno-open", () => {
  let originalDenoCommand: typeof Deno.Command;
  // Use a specific type for the spy
  let commandSpy: Spy<
    (command: string, options?: { args?: string[] }) => MockCommandOutput
  >;

  beforeEach(() => {
    // Save original Deno.Command
    originalDenoCommand = Deno.Command;
  });

  afterEach(() => {
    // Restore original Deno.Command
    (Deno.Command as unknown) = originalDenoCommand;
  });

  it("calls the correct command on macOS", async () => {
    // Save original OS detection
    const originalOs = Deno.build.os;

    try {
      // Mock OS detection - pretend we're on macOS
      Object.defineProperty(Deno.build, "os", { value: "darwin", configurable: true });

      // Mock Deno.Command implementation
      const mockSpawn = { status: Promise.resolve({ success: true, code: 0 }) };
      const mockCommandConstructor = () => ({ spawn: () => mockSpawn });
      commandSpy = spy(mockCommandConstructor);
      (Deno.Command as unknown) = commandSpy;

      // Call open
      const url = "https://example.com";
      await open(url);

      // Verify the spy was called with correct arguments
      assertSpyCalls(commandSpy, 1);
      assertEquals(commandSpy.calls[0].args[0], "open");
      assertEquals((commandSpy.calls[0].args[1] as { args: string[] }).args[0], url);
    } finally {
      // Restore original OS detection
      Object.defineProperty(Deno.build, "os", { value: originalOs, configurable: true });
    }
  });

  it("calls the correct command on Windows", async () => {
    // Save original OS detection
    const originalOs = Deno.build.os;

    try {
      // Mock OS detection - pretend we're on Windows
      Object.defineProperty(Deno.build, "os", { value: "windows", configurable: true });

      // Mock Deno.Command implementation
      const mockSpawn = { status: Promise.resolve({ success: true, code: 0 }) };
      const mockCommandConstructor = () => ({ spawn: () => mockSpawn });
      commandSpy = spy(mockCommandConstructor);
      (Deno.Command as unknown) = commandSpy;

      // Call open
      const url = "https://example.com";
      await open(url);

      // Verify the spy was called with correct arguments
      assertSpyCalls(commandSpy, 1);
      assertEquals(commandSpy.calls[0].args[0], "cmd");
      assertEquals((commandSpy.calls[0].args[1] as { args: string[] }).args[0], "/c");
      assertEquals((commandSpy.calls[0].args[1] as { args: string[] }).args[1], "start");
      assertEquals((commandSpy.calls[0].args[1] as { args: string[] }).args[2], "");
      assertEquals((commandSpy.calls[0].args[1] as { args: string[] }).args[3], url);
    } finally {
      // Restore original OS detection
      Object.defineProperty(Deno.build, "os", { value: originalOs, configurable: true });
    }
  });

  it("throws error on command failure", async () => {
    // Save original OS detection
    const originalOs = Deno.build.os;

    try {
      // Mock OS detection
      Object.defineProperty(Deno.build, "os", { value: "darwin", configurable: true });

      // Mock Deno.Command to return failure
      const mockSpawn = { status: Promise.resolve({ success: false, code: 1 }) };
      const mockCommandConstructor = () => ({ spawn: () => mockSpawn });
      commandSpy = spy(mockCommandConstructor);
      (Deno.Command as unknown) = commandSpy;

      // Call open and expect it to throw
      await assertRejects(
        () => open("https://example.com"),
        Error,
        "Failed to open"
      );
      assertSpyCalls(commandSpy, 1);
    } finally {
      // Restore original OS detection
      Object.defineProperty(Deno.build, "os", { value: originalOs, configurable: true });
    }
  });
});

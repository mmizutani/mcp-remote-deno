import { assertEquals, assertRejects } from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "std/testing/bdd.ts";
import { assertSpyCalls, spy, type Spy } from "std/testing/mock.ts";
import open from "../src/lib/deno-open.ts";

// Define the expected structure returned by the mocked Deno.Command
interface MockCommandOutput {
  output: () => Promise<{
    success: boolean;
    code: number;
    stdout: Uint8Array;
    stderr: Uint8Array;
  }>;
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
    // Mock Deno.Command implementation to return success
    const mockOutput = {
      success: true,
      code: 0,
      stdout: new Uint8Array(),
      stderr: new Uint8Array(),
    };
    const mockCommandConstructor = () => ({ output: () => Promise.resolve(mockOutput) });
    commandSpy = spy(mockCommandConstructor);
    (Deno.Command as unknown) = commandSpy;

    // Call open, specifying macOS in options
    const url = "https://example.com";
    await open(url, { os: "darwin" });

    // Verify the spy was called with correct arguments
    assertSpyCalls(commandSpy, 1);
    assertEquals(commandSpy.calls[0].args[0], "open");
    assertEquals(commandSpy.calls[0].args[1]?.args, [url]);
  });

  it("calls the correct command on Windows", async () => {
    // Mock Deno.Command implementation to return success
    const mockOutput = {
      success: true,
      code: 0,
      stdout: new Uint8Array(),
      stderr: new Uint8Array(),
    };
    const mockCommandConstructor = () => ({ output: () => Promise.resolve(mockOutput) });
    commandSpy = spy(mockCommandConstructor);
    (Deno.Command as unknown) = commandSpy;

    // Call open, specifying windows in options
    const url = "https://example.com";
    await open(url, { os: "windows" });

    // Verify the spy was called with correct arguments
    assertSpyCalls(commandSpy, 1);
    assertEquals(commandSpy.calls[0].args[0], "cmd");
    assertEquals(commandSpy.calls[0].args[1]?.args, ["/c", "start", '""', url]);
  });

  it("throws error on command failure", async () => {
    // Mock Deno.Command to return failure
    const stderrOutput = new TextEncoder().encode("Command failed error message");
    const mockOutput = {
      success: false,
      code: 1,
      stdout: new Uint8Array(),
      stderr: stderrOutput,
    };
    const mockCommandConstructor = () => ({ output: () => Promise.resolve(mockOutput) });
    commandSpy = spy(mockCommandConstructor);
    (Deno.Command as unknown) = commandSpy;

    // Call open and expect it to throw
    const url = "https://example.com";
    await assertRejects(
      () => open(url, { os: "darwin" }),
      Error,
      `Failed to open "${url}". Command "open ${url}" exited with code 1.\nStderr: Command failed error message`,
    );
    assertSpyCalls(commandSpy, 1);
  });
});

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

  it("calls the correct command on Linux", async () => {
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

    // Call open, specifying linux in options
    const url = "https://example.com";
    await open(url, { os: "linux" });

    // Verify the spy was called with correct arguments
    assertSpyCalls(commandSpy, 1);
    assertEquals(commandSpy.calls[0].args[0], "xdg-open");
    assertEquals(commandSpy.calls[0].args[1]?.args, [url]);
  });

  it("throws error for unsupported platform", async () => {
    // Call open with an unsupported platform
    const url = "https://example.com";
    await assertRejects(
      () => open(url, { os: "freebsd" }),
      Error,
      "Unsupported platform: freebsd"
    );
  });

  it("uses specified app on macOS", async () => {
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

    // Call open with app option
    const url = "https://example.com";
    const app = "Safari";
    await open(url, { os: "darwin", app: app });

    // Verify the spy was called with correct arguments
    assertSpyCalls(commandSpy, 1);
    assertEquals(commandSpy.calls[0].args[0], "open");
    assertEquals(commandSpy.calls[0].args[1]?.args, ["-a", app, url]);
  });

  it("uses specified app on Linux", async () => {
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

    // Call open with app option
    const url = "https://example.com";
    const app = "firefox";
    await open(url, { os: "linux", app: app });

    // Verify that it uses the app directly as the command
    assertSpyCalls(commandSpy, 1);
    assertEquals(commandSpy.calls[0].args[0], app);
    assertEquals(commandSpy.calls[0].args[1]?.args, [url]);
  });

  it("handles wait option on macOS", async () => {
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

    // Call open with wait option
    const url = "https://example.com";
    await open(url, { os: "darwin", wait: true });

    // Verify the spy was called with correct arguments
    assertSpyCalls(commandSpy, 1);
    assertEquals(commandSpy.calls[0].args[0], "open");
    assertEquals(commandSpy.calls[0].args[1]?.args, ["-W", url]);
  });

  it("handles wait option on Windows", async () => {
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

    // Call open with wait option
    const url = "https://example.com";
    await open(url, { os: "windows", wait: true });

    // Verify the spy was called with correct arguments
    assertSpyCalls(commandSpy, 1);
    assertEquals(commandSpy.calls[0].args[0], "cmd");
    assertEquals(commandSpy.calls[0].args[1]?.args, ["/c", "start", '""', "/wait", url]);
  });

  it("handles background option on macOS", async () => {
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

    // Call open with background option
    const url = "https://example.com";
    await open(url, { os: "darwin", background: true });

    // Verify the spy was called with correct arguments
    assertSpyCalls(commandSpy, 1);
    assertEquals(commandSpy.calls[0].args[0], "open");
    assertEquals(commandSpy.calls[0].args[1]?.args, ["-g", url]);
  });

  it("escapes ampersands in URLs on Windows", async () => {
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

    // Call open with URL containing ampersands
    const url = "https://example.com?param1=value1&param2=value2";
    await open(url, { os: "windows" });

    // Verify the spy was called with escaped ampersands
    assertSpyCalls(commandSpy, 1);
    assertEquals(commandSpy.calls[0].args[0], "cmd");
    assertEquals(
      commandSpy.calls[0].args[1]?.args,
      ["/c", "start", '""', "https://example.com?param1=value1^&param2=value2"]
    );
  });

  it("throws error when command not found", async () => {
    // Mock Deno.Command to throw NotFound error
    const mockCommandConstructor = () => {
      throw new Deno.errors.NotFound();
    };
    commandSpy = spy(mockCommandConstructor);
    (Deno.Command as unknown) = commandSpy;

    // Call open and expect it to throw
    const url = "https://example.com";
    await assertRejects(
      () => open(url, { os: "darwin" }),
      Error,
      `Failed to open "${url}": Command not found: open`
    );
    assertSpyCalls(commandSpy, 1);
  });

  it("includes stdout in error message when available", async () => {
    // Mock Deno.Command to return failure with stdout
    const stderrOutput = new TextEncoder().encode("Error details");
    const stdoutOutput = new TextEncoder().encode("Additional info");
    const mockOutput = {
      success: false,
      code: 1,
      stdout: stdoutOutput,
      stderr: stderrOutput,
    };
    const mockCommandConstructor = () => ({ output: () => Promise.resolve(mockOutput) });
    commandSpy = spy(mockCommandConstructor);
    (Deno.Command as unknown) = commandSpy;

    // Call open and expect it to throw with stdout included in error
    const url = "https://example.com";
    await assertRejects(
      () => open(url, { os: "darwin" }),
      Error,
      `Failed to open "${url}". Command "open ${url}" exited with code 1.\nStderr: Error details\nStdout: Additional info`
    );
    assertSpyCalls(commandSpy, 1);
  });
});

import { delay } from "jsr:@std/async@1/delay";

/**
 * Options for the open function.
 */
export interface OpenOptions {
  /**
   * Specify the operating system ('windows', 'darwin', 'linux').
   * Defaults to Deno.build.os. Useful for testing.
   */
  os?: string;
  /**
   * Specify an application to open the URL/file with.
   */
  app?: string;
  /**
   * Wait for the opened application to exit before resolving the promise.
   * If the application closes instantly, wait for 1 second.
   */
  wait?: boolean;
  /**
   * Use 'background' on macOS to open the application in the background.
   */
  background?: boolean; // Relevant for macOS 'open' command
}

/**
 * Opens the given URL or file path using the default application,
 * or a specified application.
 *
 * @param target The URL or file path to open.
 * @param options Optional configuration for opening the target.
 * @returns A Promise that resolves when the application has been opened (or exited if wait=true).
 * @throws Error if the platform is unsupported or if opening the target fails.
 */
export default async function open(
  target: string,
  options?: OpenOptions,
): Promise<void> {
  const currentOs = options?.os ?? Deno.build.os;
  const isWindows = currentOs === "windows";
  const isMac = currentOs === "darwin";
  const isLinux = currentOs === "linux"; // Handle Linux as well

  let command: string;
  const args: string[] = [];

  if (isWindows) {
    command = "cmd";
    args.push("/c", "start", '""'); // Use empty title

    if (options?.wait) {
      args.push("/wait");
    }

    if (options?.app) {
      args.push(options.app);
    }

    args.push(target.replace(/&/g, "^&")); // Escape ampersands for cmd
  } else {
    // Common logic for macOS and Linux, potentially differing commands
    if (isMac) {
      command = "open";
      if (options?.wait) {
        args.push("-W");
      }
      if (options?.background) {
        args.push("-g"); // Use -g for background on macOS
      }
      if (options?.app) {
        args.push("-a", options.app);
      }
    } else if (isLinux) {
      // Try common Linux commands - may need adjustment based on distribution
      command = options?.app ? options.app : "xdg-open"; // Use specific app or xdg-open
      // Note: Wait behavior might be inconsistent on Linux with xdg-open
    } else {
      throw new Error(`Unsupported platform: ${currentOs}`);
    }
    args.push(target);
  }

  try {
    const process = new Deno.Command(command, {
      args: args,
      // Use 'piped' or 'null' for testing to avoid interfering with test output
      // For actual use, 'inherit' might be desired, but makes testing harder.
      stdout: "piped", // Capture stdout
      stderr: "piped", // Capture stderr
    });

    // Use output() to wait for the command and get status/output
    const { success, code, stdout, stderr } = await process.output();

    if (!success) {
      const errorDetails = new TextDecoder().decode(stderr).trim();
      const stdoutDetails = new TextDecoder().decode(stdout).trim();
      let errorMessage = `Failed to open "${target}". Command "${command} ${
        args.join(" ")
      }" exited with code ${code}.`;
      if (errorDetails) errorMessage += `\nStderr: ${errorDetails}`;
      if (stdoutDetails) errorMessage += `\nStdout: ${stdoutDetails}`; // Include stdout too
      throw new Error(errorMessage);
    }

    // Handle 'wait' specifically on macOS/Linux if needed, as process.output() already waits.
    // The 'wait' option for cmd /c start /wait is handled by the command itself.
    // For macOS 'open -W', output() correctly waits.
    // For Linux, if wait is true and we used xdg-open, true waiting might not be possible easily.
    // We might need a fallback sleep if 'wait' is requested on Linux without a specific app.
    if (options?.wait && isLinux && !options?.app) {
      // xdg-open often returns immediately. Add a small delay as a basic wait.
      await delay(1000); // Wait 1 second (adjust as necessary)
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(
        `Failed to open "${target}": Command not found: ${command}`,
      );
    }
    // Re-throw other errors or wrap them
    throw error instanceof Error ? error : new Error(String(error));
  }
}

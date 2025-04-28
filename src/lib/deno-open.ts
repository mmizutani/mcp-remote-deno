/**
 * Opens a URL in the default browser.
 * This is a cross-platform implementation using Deno subprocess API
 * @param url The URL to open
 * @returns A promise that resolves when the command has been executed
 */
export default async function open(url: string): Promise<void> {
  let command: string[];
  const isWindows = Deno.build.os === "windows";
  const isMac = Deno.build.os === "darwin";
  const isLinux = Deno.build.os === "linux";

  if (isWindows) {
    command = ["cmd", "/c", "start", "", url];
  } else if (isMac) {
    command = ["open", url];
  } else if (isLinux) {
    // On Linux, try several common browser-opener commands
    const linuxCommands = [
      ["xdg-open", url],
      ["gnome-open", url],
      ["kde-open", url],
      ["wslview", url] // For Windows Subsystem for Linux
    ];

    // Try each command in order until one succeeds
    for (const cmd of linuxCommands) {
      try {
        const process = new Deno.Command(cmd[0], {
          args: cmd.slice(1),
          stdout: "null",
          stderr: "null"
        }).spawn();

        const status = await process.status;

        if (status.success) {
          return; // Command succeeded, so exit the function
        }
      } catch {
        // If this command fails, try the next one
      }
    }

    // If we get here, none of the commands worked
    throw new Error("Could not open browser on Linux. Please open URL manually.");
  } else {
    throw new Error(`Unsupported platform: ${Deno.build.os}`);
  }

  // For Windows and Mac, execute the chosen command
  if (isWindows || isMac) {
    try {
      const process = new Deno.Command(command[0], {
        args: command.slice(1),
        stdout: "null",
        stderr: "null"
      }).spawn();

      const status = await process.status;

      if (!status.success) {
        throw new Error(`Failed to open ${url} in browser`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to open ${url} in browser: ${errorMessage}`);
    }
  }
}

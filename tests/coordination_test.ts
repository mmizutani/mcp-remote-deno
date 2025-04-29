import { assertEquals } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import { stub } from "std/testing/mock.ts";
import {
  isLockValid,
  isPidRunning,
  waitForAuthentication,
} from "../src/lib/coordination.ts";

/**
 * Basic tests for the coordination module
 */
describe("coordination", () => {
  describe("isPidRunning", () => {
    it("returns false when Deno.Command throws an error", async () => {
      const originalCommand = Deno.Command;
      try {
        // @ts-ignore - Replace Deno.Command with a function that throws
        Deno.Command = () => {
          throw new Error("Test error");
        };

        const result = await isPidRunning(1234);
        assertEquals(result, false);
      } finally {
        // Restore original Command
        Deno.Command = originalCommand;
      }
    });

    if (Deno.build.os === "linux" || Deno.build.os === "darwin") {
      it("checks if a process is running on non-Windows by using kill command", async () => {
        // Just verify it runs without error - actual functionality depends on the OS
        const result = await isPidRunning(Deno.pid);
        // Our own process should be running
        assertEquals(typeof result, "boolean");
      });
    } else if (Deno.build.os === "windows") {
      it("checks if a process is running on Windows by using tasklist command", async () => {
        // Just verify it runs without error - actual functionality depends on the OS
        const result = await isPidRunning(Deno.pid);
        // Our own process should be running
        assertEquals(typeof result, "boolean");
      });
    }
  });

  describe("isLockValid", () => {
    const mockLockData = {
      pid: 1234, // A likely non-existent PID
      port: 8000,
      timestamp: Date.now() - (31 * 60 * 1000), // Expired (31 minutes old)
    };

    it("returns false for expired lockfile", async () => {
      const result = await isLockValid(mockLockData);
      assertEquals(result, false);
    });

    it("returns false for non-existent process", async () => {
      // Find a PID that's unlikely to exist
      let testPid = 999999;
      while (await isPidRunning(testPid)) {
        testPid += 1000;
      }

      const validTimestampData = {
        ...mockLockData,
        pid: testPid,
        timestamp: Date.now(), // Not expired
      };

      const result = await isLockValid(validTimestampData);
      assertEquals(result, false);
    });
  });

  describe("waitForAuthentication", () => {
    let fetchStub: ReturnType<typeof stub>;
    let setTimeoutStub: ReturnType<typeof stub>;

    beforeEach(() => {
      // @ts-ignore - Required for testing
      setTimeoutStub = stub(
        globalThis,
        "setTimeout",
        (callback: TimerHandler) => {
          if (typeof callback === "function") {
            callback();
          }
          return 1 as unknown as ReturnType<typeof setTimeout>;
        },
      );
    });

    afterEach(() => {
      // Clean up
      if (fetchStub) fetchStub.restore();
      setTimeoutStub.restore();
    });

    it("returns true when authentication completes", async () => {
      // Mock fetch to simulate a successful authentication
      // @ts-ignore - Required for testing
      fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(new Response("Auth completed", { status: 200 })),
      );

      const result = await waitForAuthentication(8000);
      assertEquals(result, true);
    });

    it("returns false for unexpected status", async () => {
      // Mock fetch to simulate an error response
      // @ts-ignore - Required for testing
      fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(new Response("Error", { status: 500 })),
      );

      const result = await waitForAuthentication(8000);
      assertEquals(result, false);
    });

    it("returns false when fetch fails", async () => {
      // Mock fetch to simulate a network error
      // @ts-ignore - Required for testing
      fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.reject(new Error("Network error")),
      );

      const result = await waitForAuthentication(8000);
      assertEquals(result, false);
    });
  });
});

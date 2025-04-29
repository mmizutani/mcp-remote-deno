/**
 * Test utilities for mcp-remote-deno tests
 */

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A mock server for testing
 */
export class MockServer {
  /**
   * The HTTP server instance
   */
  server: Partial<Server>;

  /**
   * A function that returns the auth code
   */
  waitForAuthCode: () => Promise<string>;

  /**
   * Creates a new MockServer
   * @param port The port the server is listening on
   */
  constructor(port = 8000) {
    this.server = {
      address: () => ({
        port,
        address: "127.0.0.1",
        family: "IPv4"
      } as AddressInfo),
      // Add other server properties as needed
    };
    this.waitForAuthCode = () => Promise.resolve("mock-auth-code");
  }
}

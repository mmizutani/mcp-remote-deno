import { assertEquals, assertExists } from "std/assert/mod.ts";
import { beforeEach, describe, it } from "std/testing/bdd.ts";
import { mcpProxy } from "../src/lib/utils.ts";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

// Mock Transport implementation for testing
class MockTransport implements Transport {
  public onmessage:
    | ((message: unknown, extra?: { authInfo?: unknown }) => void)
    | undefined;
  public onclose: (() => void) | undefined;
  public onerror: ((error: Error) => void) | undefined;
  public closed = false;
  public messages: unknown[] = [];
  public errors: Error[] = [];

  constructor(public name: string) {}

  start(): Promise<void> {
    // Mock start method - does nothing
    return Promise.resolve();
  }

  send(message: unknown): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    if (this.onclose) {
      this.onclose();
    }
    return Promise.resolve();
  }

  // Helper method to simulate receiving a message
  simulateMessage(message: unknown): void {
    if (this.onmessage) {
      this.onmessage(message);
    }
  }

  // Helper method to simulate a close event
  simulateClose(): void {
    if (this.onclose) {
      this.onclose();
    }
  }

  // Helper method to simulate an error
  simulateError(error: Error): void {
    this.errors.push(error);
    if (this.onerror) {
      this.onerror(error);
    }
  }
}

describe("MCP Proxy Integration", () => {
  let clientTransport: MockTransport;
  let serverTransport: MockTransport;

  beforeEach(() => {
    clientTransport = new MockTransport("client");
    serverTransport = new MockTransport("server");
  });

  it("forwards messages from client to server", () => {
    // Set up the proxy
    mcpProxy({
      transportToClient: clientTransport,
      transportToServer: serverTransport,
    });

    // Verify event handlers are set up
    assertExists(clientTransport.onmessage);
    assertExists(clientTransport.onclose);
    assertExists(clientTransport.onerror);
    assertExists(serverTransport.onmessage);
    assertExists(serverTransport.onclose);
    assertExists(serverTransport.onerror);

    // Simulate a message from client
    const clientMessage = { id: 1, method: "test", params: {} };
    clientTransport.simulateMessage(clientMessage);

    // Check that the message was forwarded to server
    assertEquals(serverTransport.messages.length, 1);
    assertEquals(serverTransport.messages[0], clientMessage);
  });

  it("forwards messages from server to client", () => {
    // Set up the proxy
    mcpProxy({
      transportToClient: clientTransport,
      transportToServer: serverTransport,
    });

    // Simulate a message from server
    const serverMessage = { id: 1, result: { value: "test" } };
    serverTransport.simulateMessage(serverMessage);

    // Check that the message was forwarded to client
    assertEquals(clientTransport.messages.length, 1);
    assertEquals(clientTransport.messages[0], serverMessage);
  });

  it("closes both transports when client closes", () => {
    // Set up the proxy
    mcpProxy({
      transportToClient: clientTransport,
      transportToServer: serverTransport,
    });

    // Simulate client closing
    clientTransport.simulateClose();

    // Check that server transport was closed
    assertEquals(serverTransport.closed, true);
  });

  it("closes both transports when server closes", () => {
    // Set up the proxy
    mcpProxy({
      transportToClient: clientTransport,
      transportToServer: serverTransport,
    });

    // Simulate server closing
    serverTransport.simulateClose();

    // Check that client transport was closed
    assertEquals(clientTransport.closed, true);
  });
});

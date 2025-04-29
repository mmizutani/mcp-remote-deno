import { describe, it, beforeEach, afterEach } from "std/testing/bdd.ts";
import { DenoHttpServer, ResponseBuilder } from "../src/lib/deno-http-server.ts";
import { assertEquals } from "std/assert/mod.ts";

describe("DenoHttpServer", () => {
  let server: DenoHttpServer;
  let serverInstance: ReturnType<DenoHttpServer["listen"]>;
  // Define testPort at the describe level so it's available to all tests
  const testPort = 9876;

  beforeEach(() => {
    server = new DenoHttpServer();
    // Start the server on a random available port
    serverInstance = server.listen(testPort, "localhost", () => {
      // Server started
    });
  });

  afterEach(async () => {
    if (serverInstance) {
      await server.close();
    }
  });

  it("registers and handles GET routes", async () => {
    let handlerCalled = false;
    let reqPath = "";
    let reqQuery: Record<string, string> = {};

    // Register a route handler
    server.get("/test", (req, res) => {
      handlerCalled = true;
      reqPath = req.path;
      reqQuery = req.query;
      res.status(200).send("OK");
    });

    // Send a request to the server
    const response = await fetch(`http://localhost:${testPort}/test?param=value`);
    const text = await response.text();

    // Verify the response
    assertEquals(response.status, 200);
    assertEquals(text, "OK");
    assertEquals(handlerCalled, true);
    assertEquals(reqPath, "/test");
    assertEquals(reqQuery.param, "value");
  });

  it("should handle 404 for non-existent routes", async () => {
    const server = new DenoHttpServer();
    const localTestPort = 9877;
    let serverInstance!: ReturnType<DenoHttpServer["listen"]>;

    try {
  // Start the server on a random available port
      serverInstance = server.listen(localTestPort, "localhost");

      // Send a request to a non-existent route
      const response = await fetch(`http://localhost:${localTestPort}/non-existent`);

      // Verify the response
      assertEquals(response.status, 404);
      await response.body?.cancel(); // Consume the body to prevent leaks
    } finally {
      if (serverInstance) {
        server.close();
      }
    }
  });

  it("should listen without callback", () => {
    const server = new DenoHttpServer();
    const localTestPort = 9878;
    let serverInstance!: ReturnType<DenoHttpServer["listen"]>;

    try {
      serverInstance = server.listen(localTestPort, "localhost");
      // Our implementation returns an object with address() that returns {port}
      const addr = serverInstance.address() as { port: number };
      assertEquals(localTestPort, addr.port);
    } finally {
      if (serverInstance) {
        server.close();
      }
    }
  });
});

describe("ResponseBuilder", () => {
  it("builds response with status code and body", async () => {
    const responseBuilder = new ResponseBuilder();

    // Set status code and body
    responseBuilder.status(404).send("Not Found");

    // Get the response
    const response = await responseBuilder.getResponse();

    // Verify the response
    assertEquals(response.status, 404);
    assertEquals(await response.text(), "Not Found");
  });

  it("only sends response once", async () => {
    const responseBuilder = new ResponseBuilder();

    // Send first response
    responseBuilder.status(200).send("First");

    // Try to send another response
    responseBuilder.status(404).send("Second");

    // Get the response - should be the first one
    const response = await responseBuilder.getResponse();

    // Verify the response
    assertEquals(response.status, 200);
    assertEquals(await response.text(), "First");
  });
});

import { assertEquals } from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "std/testing/bdd.ts";
import { DenoHttpServer, ResponseBuilder } from "../src/lib/deno-http-server.ts";

describe("DenoHttpServer", () => {
  let server: DenoHttpServer;
  let serverInstance: ReturnType<DenoHttpServer["listen"]>;

  beforeEach(() => {
    server = new DenoHttpServer();
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

    // Start the server on a random available port
    const testPort = 9876;
    serverInstance = server.listen(testPort, () => {
      // Server started
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

  it("returns 404 for non-existent routes", async () => {
    // Start the server on a random available port
    const testPort = 9877;
    serverInstance = server.listen(testPort);

    // Send a request to a non-existent route
    const response = await fetch(`http://localhost:${testPort}/non-existent`);

    // Verify the response
    assertEquals(response.status, 404);
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

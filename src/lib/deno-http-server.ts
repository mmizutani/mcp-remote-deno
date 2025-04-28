import type { Server } from "node:http";

// Simple type definitions for our server
interface RequestLike {
  query: Record<string, string>;
  path: string;
}

/**
 * A simple HTTP server using Deno's native HTTP server capabilities
 * that mimics the Express API for our specific use case
 */
export class DenoHttpServer {
  private server: Deno.HttpServer | null = null;
  private routes: Map<string, (req: Request) => Promise<Response> | Response> = new Map();

  /**
   * Register a GET route handler
   * @param path The path to handle
   * @param handler The handler function
   */
  get(path: string, handler: (req: RequestLike, res: ResponseBuilder) => void): void {
    this.routes.set(path, async (request: Request) => {
      const url = new URL(request.url);
      const searchParams = url.searchParams;
      const responseBuilder = new ResponseBuilder();

      // Create a simple request object that mimics Express req
      const query: Record<string, string> = {};
      for (const [key, value] of searchParams) {
        query[key] = value;
      }

      const req: RequestLike = {
        query,
        path: url.pathname,
      };

      // Call the handler with our simplified req/res objects
      handler(req, responseBuilder);

      // Wait for the response to be ready (in case of async operations)
      return await responseBuilder.getResponse();
    });
  }

  /**
   * Start the server listening on the specified port
   * @param port The port to listen on
   * @param callback Optional callback when server is ready
   */
  listen(port: number, callback?: () => void): Server {
    this.server = Deno.serve({
      port,
      onListen: callback ? () => callback() : undefined,
      handler: async (request: Request) => {
        const url = new URL(request.url);
        const path = url.pathname;

        // Find the route handler
        const handler = this.routes.get(path);
        if (handler) {
          return await handler(request);
        }

        // Route not found
        return new Response("Not Found", { status: 404 });
      }
    });

    // Return a dummy server object that mimics Node's HTTP server
    // This is needed to maintain API compatibility
    return {
      close: () => this.close(),
    } as unknown as Server;
  }

  /**
   * Close the server
   */
  close(): Promise<void> {
    if (this.server) {
      return this.server.shutdown();
    }
    return Promise.resolve();
  }
}

/**
 * Response builder class that mimics Express Response
 */
export class ResponseBuilder {
  private statusCode = 200;
  private body: string | null = null;
  private responsePromise: Promise<Response>;
  private resolveResponse!: (response: Response) => void;
  headersSent = false;

  constructor() {
    // Create a promise that will be resolved when the response is ready
    this.responsePromise = new Promise((resolve) => {
      this.resolveResponse = resolve;
    });
  }

  /**
   * Set the HTTP status code
   * @param code HTTP status code
   * @returns this instance for chaining
   */
  status(code: number): ResponseBuilder {
    this.statusCode = code;
    return this;
  }

  /**
   * Send a response
   * @param data The response data
   */
  send(data: string): void {
    if (this.headersSent) {
      return;
    }
    this.headersSent = true;
    this.body = data;
    this.resolveResponse(new Response(this.body, { status: this.statusCode }));
  }

  /**
   * Get the response promise
   * @returns Promise that resolves to the final Response
   */
  getResponse(): Promise<Response> {
    return this.responsePromise;
  }
}

/**
 * Create and return a new HTTP server instance
 * @returns A new HTTP server instance
 */
export default function createServer(): DenoHttpServer {
  return new DenoHttpServer();
}

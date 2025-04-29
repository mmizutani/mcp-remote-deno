import { assertEquals, assertRejects } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import {
  assertSpyCallArg,
  assertSpyCalls,
  spy,
  stub,
} from "std/testing/mock.ts";
import { NodeOAuthClientProvider } from "../src/lib/node-oauth-client-provider.ts";
import * as mcpAuth from "../src/lib/mcp-auth-config.ts";
import * as utils from "../src/lib/utils.ts";
import openModule from "../src/lib/deno-open.ts";
import {
  OAuthClientInformationSchema,
  OAuthTokensSchema,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

// Helper function to check if a string contains a substring
function stringContaining(expected: string) {
  return {
    asymmetricMatch: (actual: string) => {
      return typeof actual === "string" && actual.includes(expected);
    },
    toString: () => `StringContaining(${expected})`,
  };
}

describe("NodeOAuthClientProvider", () => {
  const testServerUrl = "https://test-server.example.com";
  const testServerUrlHash = "0123456789abcdef0123456789abcdef";
  const testCallbackPort = 3000;
  const testOptions = {
    serverUrl: testServerUrl,
    callbackPort: testCallbackPort,
    callbackPath: "/test/callback",
    clientName: "Test Client",
    clientUri: "https://test-client.example.com",
    softwareId: "test-software-id",
    softwareVersion: "1.0.0",
  };

  beforeEach(() => {
    // Add any setup needed for each test
  });

  afterEach(() => {
    // Clean up after each test
  });

  describe("constructor", () => {
    it("initializes with provided options", () => {
      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );

      const provider = new NodeOAuthClientProvider(testOptions);

      assertEquals(provider.options, testOptions);
      assertSpyCalls(getServerUrlHashStub, 1);
      assertSpyCallArg(getServerUrlHashStub, 0, 0, testServerUrl);

      getServerUrlHashStub.restore();
    });

    it("uses default values for optional parameters", () => {
      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );

      const provider = new NodeOAuthClientProvider({
        serverUrl: testServerUrl,
        callbackPort: testCallbackPort,
      });

      assertEquals(provider.options.serverUrl, testServerUrl);
      assertEquals(provider.options.callbackPort, testCallbackPort);
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      assertEquals(provider["callbackPath"], "/oauth/callback"); // Default value
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      assertEquals(provider["clientName"], "MCP CLI Client"); // Default value
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      assertEquals(
        provider["clientUri"],
        "https://github.com/modelcontextprotocol/mcp-cli",
      ); // Default value
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      assertEquals(
        provider["softwareId"],
        "2e6dc280-f3c3-4e01-99a7-8181dbd1d23d",
      ); // Default value
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      assertEquals(provider["softwareVersion"], utils.MCP_REMOTE_VERSION); // Default value

      getServerUrlHashStub.restore();
    });
  });

  describe("getters", () => {
    it("returns correct redirectUrl", () => {
      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );

      const provider = new NodeOAuthClientProvider(testOptions);
      assertEquals(
        provider.redirectUrl,
        `http://127.0.0.1:${testCallbackPort}${testOptions.callbackPath}`,
      );

      getServerUrlHashStub.restore();
    });

    it("returns correct clientMetadata", () => {
      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );

      const provider = new NodeOAuthClientProvider(testOptions);

      const expectedMetadata = {
        redirect_uris: [
          `http://127.0.0.1:${testCallbackPort}${testOptions.callbackPath}`,
        ],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_name: testOptions.clientName,
        client_uri: testOptions.clientUri,
        software_id: testOptions.softwareId,
        software_version: testOptions.softwareVersion,
      };

      assertEquals(provider.clientMetadata, expectedMetadata);

      getServerUrlHashStub.restore();
    });
  });

  describe("clientInformation", () => {
    it("returns client information when it exists", async () => {
      const mockClientInfo = {
        client_id: "test-client-id",
        redirect_uris: ["http://localhost:3000/callback"],
      };

      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );
      const readJsonFileStub = stub(
        mcpAuth,
        "readJsonFile",
        () => Promise.resolve(mockClientInfo),
      );

      const provider = new NodeOAuthClientProvider(testOptions);
      const result = await provider.clientInformation();

      assertEquals(result, mockClientInfo);
      assertSpyCalls(readJsonFileStub, 1);
      assertSpyCallArg(readJsonFileStub, 0, 0, testServerUrlHash);
      assertSpyCallArg(readJsonFileStub, 0, 1, "client_info.json");
      assertSpyCallArg(readJsonFileStub, 0, 2, OAuthClientInformationSchema);

      getServerUrlHashStub.restore();
      readJsonFileStub.restore();
    });

    it("returns undefined when client information doesn't exist", async () => {
      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );
      const readJsonFileStub = stub(
        mcpAuth,
        "readJsonFile",
        () => Promise.resolve(undefined),
      );

      const provider = new NodeOAuthClientProvider(testOptions);
      const result = await provider.clientInformation();

      assertEquals(result, undefined);
      assertSpyCalls(readJsonFileStub, 1);

      getServerUrlHashStub.restore();
      readJsonFileStub.restore();
    });
  });

  describe("saveClientInformation", () => {
    it("saves client information", async () => {
      const mockClientInfo: OAuthClientInformationFull = {
        client_id: "test-client-id",
        redirect_uris: ["http://localhost:3000/callback"],
        client_secret: "test-secret",
        client_id_issued_at: 123456789,
        client_secret_expires_at: 0,
      };

      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );
      const writeJsonFileStub = stub(
        mcpAuth,
        "writeJsonFile",
        () => Promise.resolve(),
      );

      const provider = new NodeOAuthClientProvider(testOptions);
      await provider.saveClientInformation(mockClientInfo);

      assertSpyCalls(writeJsonFileStub, 1);
      assertSpyCallArg(writeJsonFileStub, 0, 0, testServerUrlHash);
      assertSpyCallArg(writeJsonFileStub, 0, 1, "client_info.json");
      assertSpyCallArg(writeJsonFileStub, 0, 2, mockClientInfo);

      getServerUrlHashStub.restore();
      writeJsonFileStub.restore();
    });
  });

  describe("tokens", () => {
    it("returns tokens when they exist", async () => {
      const mockTokens: OAuthTokens = {
        access_token: "test-access-token",
        token_type: "Bearer",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
      };

      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );
      const readJsonFileStub = stub(
        mcpAuth,
        "readJsonFile",
        () => Promise.resolve(mockTokens),
      );

      const provider = new NodeOAuthClientProvider(testOptions);
      const result = await provider.tokens();

      assertEquals(result, mockTokens);
      assertSpyCalls(readJsonFileStub, 1);
      assertSpyCallArg(readJsonFileStub, 0, 0, testServerUrlHash);
      assertSpyCallArg(readJsonFileStub, 0, 1, "tokens.json");
      assertSpyCallArg(readJsonFileStub, 0, 2, OAuthTokensSchema);

      getServerUrlHashStub.restore();
      readJsonFileStub.restore();
    });

    it("returns undefined when tokens don't exist", async () => {
      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );
      const readJsonFileStub = stub(
        mcpAuth,
        "readJsonFile",
        () => Promise.resolve(undefined),
      );

      const provider = new NodeOAuthClientProvider(testOptions);
      const result = await provider.tokens();

      assertEquals(result, undefined);
      assertSpyCalls(readJsonFileStub, 1);

      getServerUrlHashStub.restore();
      readJsonFileStub.restore();
    });
  });

  describe("saveTokens", () => {
    it("saves tokens", async () => {
      const mockTokens: OAuthTokens = {
        access_token: "test-access-token",
        token_type: "Bearer",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
      };

      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );
      const writeJsonFileStub = stub(
        mcpAuth,
        "writeJsonFile",
        () => Promise.resolve(),
      );

      const provider = new NodeOAuthClientProvider(testOptions);
      await provider.saveTokens(mockTokens);

      assertSpyCalls(writeJsonFileStub, 1);
      assertSpyCallArg(writeJsonFileStub, 0, 0, testServerUrlHash);
      assertSpyCallArg(writeJsonFileStub, 0, 1, "tokens.json");
      assertSpyCallArg(writeJsonFileStub, 0, 2, mockTokens);

      getServerUrlHashStub.restore();
      writeJsonFileStub.restore();
    });
  });

  describe("redirectToAuthorization", () => {
    it("logs the authorization URL and opens browser successfully", async () => {
      const authUrl = new URL(
        "https://auth.example.com/authorize?client_id=test",
      );

      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );
      const logSpy = spy(utils, "log");
      const openStub = stub(
        openModule,
        "default" as keyof typeof openModule,
        () => Promise.resolve(),
      );

      const provider = new NodeOAuthClientProvider(testOptions);
      await provider.redirectToAuthorization(authUrl);

      assertSpyCalls(logSpy, 2);
      assertSpyCallArg(
        logSpy,
        0,
        0,
        stringContaining("Please authorize this client by visiting:"),
      );
      assertSpyCallArg(logSpy, 1, 0, "Browser opened automatically.");

      assertSpyCalls(openStub, 1);
      assertSpyCallArg(openStub, 0, 0, authUrl.toString());

      getServerUrlHashStub.restore();
      logSpy.restore();
      openStub.restore();
    });

    it("logs a fallback message when browser can't be opened", async () => {
      const authUrl = new URL(
        "https://auth.example.com/authorize?client_id=test",
      );

      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );
      const logSpy = spy(utils, "log");
      const openStub = stub(
        openModule,
        "default" as keyof typeof openModule,
        () => {
          throw new Error("Failed to open browser");
        },
      );

      const provider = new NodeOAuthClientProvider(testOptions);
      await provider.redirectToAuthorization(authUrl);

      assertSpyCalls(logSpy, 2);
      assertSpyCallArg(
        logSpy,
        0,
        0,
        stringContaining("Please authorize this client by visiting:"),
      );
      assertSpyCallArg(
        logSpy,
        1,
        0,
        "Could not open browser automatically. Please copy and paste the URL above into your browser.",
      );

      assertSpyCalls(openStub, 1);

      getServerUrlHashStub.restore();
      logSpy.restore();
      openStub.restore();
    });
  });

  describe("saveCodeVerifier", () => {
    it("saves the code verifier", async () => {
      const codeVerifier = "test-code-verifier";

      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );
      const writeTextFileStub = stub(
        mcpAuth,
        "writeTextFile",
        () => Promise.resolve(),
      );

      const provider = new NodeOAuthClientProvider(testOptions);
      await provider.saveCodeVerifier(codeVerifier);

      assertSpyCalls(writeTextFileStub, 1);
      assertSpyCallArg(writeTextFileStub, 0, 0, testServerUrlHash);
      assertSpyCallArg(writeTextFileStub, 0, 1, "code_verifier.txt");
      assertSpyCallArg(writeTextFileStub, 0, 2, codeVerifier);

      getServerUrlHashStub.restore();
      writeTextFileStub.restore();
    });
  });

  describe("codeVerifier", () => {
    it("returns the code verifier when it exists", async () => {
      const codeVerifier = "test-code-verifier";

      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );
      const readTextFileStub = stub(
        mcpAuth,
        "readTextFile",
        () => Promise.resolve(codeVerifier),
      );

      const provider = new NodeOAuthClientProvider(testOptions);
      const result = await provider.codeVerifier();

      assertEquals(result, codeVerifier);
      assertSpyCalls(readTextFileStub, 1);
      assertSpyCallArg(readTextFileStub, 0, 0, testServerUrlHash);
      assertSpyCallArg(readTextFileStub, 0, 1, "code_verifier.txt");
      assertSpyCallArg(
        readTextFileStub,
        0,
        2,
        "No code verifier saved for session",
      );

      getServerUrlHashStub.restore();
      readTextFileStub.restore();
    });

    it("throws an error when the code verifier doesn't exist", async () => {
      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );
      const readTextFileStub = stub(
        mcpAuth,
        "readTextFile",
        () => {
          throw new Error("No code verifier saved for session");
        },
      );

      const provider = new NodeOAuthClientProvider(testOptions);

      await assertRejects(
        () => provider.codeVerifier(),
        Error,
        "No code verifier saved for session",
      );

      assertSpyCalls(readTextFileStub, 1);

      getServerUrlHashStub.restore();
      readTextFileStub.restore();
    });
  });

  // Integration test to verify the full OAuth workflow
  describe("integration", () => {
    it("performs full OAuth workflow correctly", async () => {
      // Setup client info, tokens, and code verifier
      const clientInfo: OAuthClientInformationFull = {
        client_id: "test-client-id",
        redirect_uris: ["http://localhost:3000/callback"],
        client_secret: "test-secret",
        client_id_issued_at: 123456789,
        client_secret_expires_at: 0,
      };

      const tokens: OAuthTokens = {
        access_token: "test-access-token",
        token_type: "Bearer",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
      };

      const codeVerifier = "test-code-verifier";

      // Set up stubs
      const getServerUrlHashStub = stub(
        utils,
        "getServerUrlHash",
        () => testServerUrlHash,
      );
      const writeJsonFileStub = stub(
        mcpAuth,
        "writeJsonFile",
        () => Promise.resolve(),
      );
      const writeTextFileStub = stub(
        mcpAuth,
        "writeTextFile",
        () => Promise.resolve(),
      );
      const openStub = stub(
        openModule,
        "default" as keyof typeof openModule,
        () => Promise.resolve(),
      );

      const provider = new NodeOAuthClientProvider(testOptions);

      // Execute workflow
      await provider.saveClientInformation(clientInfo);
      await provider.saveTokens(tokens);
      await provider.saveCodeVerifier(codeVerifier);

      // Test redirect to authorization
      const authUrl = new URL(
        "https://auth.example.com/authorize?client_id=test",
      );
      await provider.redirectToAuthorization(authUrl);

      // Verify calls were made
      assertSpyCalls(writeJsonFileStub, 2); // client info and tokens
      assertSpyCalls(writeTextFileStub, 1); // code verifier
      assertSpyCalls(openStub, 1); // browser open

      // Restore all stubs
      getServerUrlHashStub.restore();
      writeJsonFileStub.restore();
      writeTextFileStub.restore();
      openStub.restore();
    });
  });
});

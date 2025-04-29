import {
  assert,
  assertEquals,
  assertMatch,
  assertRejects,
} from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import {
  assertSpyCallArg,
  assertSpyCalls,
  spy,
} from "std/testing/mock.ts";
import type { Spy } from "std/testing/mock.ts";
import { NodeOAuthClientProvider } from "../src/lib/node-oauth-client-provider.ts";
import {
  OAuthClientInformationSchema,
  OAuthTokensSchema,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type * as McpAuthTypes from "../src/lib/mcp-auth-config.ts";
import type * as UtilsTypes from "../src/lib/utils.ts";
import type * as OpenModuleTypes from "../src/lib/deno-open.ts";
import type { NodeOAuthClientProviderDeps } from "../src/lib/node-oauth-client-provider.ts"; // Import deps interface

// Define types for mock functions for better type safety
// deno-lint-ignore no-explicit-any
type MockFn<T extends (...args: any[]) => any> = Spy<T>;

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

  // Declare mock functions with specific types
  let mockGetServerUrlHash: MockFn<typeof UtilsTypes.getServerUrlHash>;
  let mockReadJsonFile: MockFn<typeof McpAuthTypes.readJsonFile>;
  let mockWriteJsonFile: MockFn<typeof McpAuthTypes.writeJsonFile>;
  let mockReadTextFile: MockFn<typeof McpAuthTypes.readTextFile>;
  let mockWriteTextFile: MockFn<typeof McpAuthTypes.writeTextFile>;
  let mockLog: MockFn<typeof UtilsTypes.log>;
  let mockOpen: MockFn<typeof OpenModuleTypes.default>;
  let mockDeps: NodeOAuthClientProviderDeps; // Use the imported interface

  beforeEach(() => {
    // Reset mocks before each test
    mockGetServerUrlHash = spy(() => testServerUrlHash);
    const basicReadJsonMock = spy(() => Promise.resolve(undefined));
    mockReadJsonFile = basicReadJsonMock as unknown as MockFn<
      typeof McpAuthTypes.readJsonFile
    >;
    mockWriteJsonFile = spy(() => Promise.resolve());
    mockReadTextFile = spy(() => Promise.reject(new Error("File not found")));
    mockWriteTextFile = spy(() => Promise.resolve());
    mockLog = spy();
    mockOpen = spy(() => Promise.resolve());

    // Group mocks into the deps object for injection
    mockDeps = {
      getServerUrlHash: mockGetServerUrlHash,
      readJsonFile: mockReadJsonFile,
      writeJsonFile: mockWriteJsonFile,
      readTextFile: mockReadTextFile,
      writeTextFile: mockWriteTextFile,
      log: mockLog,
      open: mockOpen,
      mcpRemoteVersion: "test-version", // Provide a test version
    };
    // Add any setup needed for each test
  });

  afterEach(() => {
    // Restore any stubs after each test to avoid interference
    // This assumes stub instances are accessible or managed globally/contextually
    // For simplicity, let's re-stub in each test and restore there if needed, or manage stubs better.
    // If stubs are created within `it` blocks, they should be restored there.
    // Clean up after each test
  });

  describe("constructor", () => {
    it("initializes with provided options", () => {
      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);

      assertEquals(provider.options, testOptions);
      // Check if getServerUrlHash was called during construction
      assertSpyCalls(mockGetServerUrlHash, 1);
      assertSpyCallArg(mockGetServerUrlHash, 0, 0, testServerUrl);
    });

    it("uses default values for optional parameters", () => {
      const provider = new NodeOAuthClientProvider({
        serverUrl: testServerUrl,
        callbackPort: testCallbackPort,
      }, mockDeps);

      assertEquals(provider.options.serverUrl, testServerUrl);
      assertEquals(provider.options.callbackPort, testCallbackPort);
      assertEquals(provider["callbackPath"], "/oauth/callback"); // Default value
      assertEquals(provider["clientName"], "MCP CLI Client"); // Default value
      assertEquals(
        provider["clientUri"],
        "https://github.com/modelcontextprotocol/mcp-cli",
      ); // Default value
      assertEquals(
        provider["softwareId"],
        "2e6dc280-f3c3-4e01-99a7-8181dbd1d23d",
      ); // Default value
      assertEquals(
        provider.clientMetadata.software_version,
        mockDeps.mcpRemoteVersion,
      );
    });
  });

  describe("getters", () => {
    it("returns correct redirectUrl", () => {
      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);
      assertEquals(
        provider.redirectUrl,
        `http://127.0.0.1:${testCallbackPort}${testOptions.callbackPath}`,
      );
      assertSpyCalls(mockGetServerUrlHash, 1); // Called in constructor
    });

    it("returns correct clientMetadata", () => {
      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);

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
      assertSpyCalls(mockGetServerUrlHash, 1);
    });
  });

  describe("clientInformation", () => {
    it("returns client information when it exists", async () => {
      const mockClientInfo = {
        client_id: "test-client-id",
        redirect_uris: ["http://localhost:3000/callback"],
      };

      // Set up mock return value for this test case
      const specificReadJsonMockClient = spy(() =>
        Promise.resolve(mockClientInfo)
      );
      mockReadJsonFile = specificReadJsonMockClient as unknown as MockFn<
        typeof McpAuthTypes.readJsonFile
      >;
      mockDeps.readJsonFile = mockReadJsonFile;

      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);
      const result = await provider.clientInformation();

      assertEquals(result, mockClientInfo);
      assertSpyCalls(mockReadJsonFile, 1);
      assertSpyCallArg(mockReadJsonFile, 0, 0, testServerUrlHash);
      assertSpyCallArg(mockReadJsonFile, 0, 1, "client_info.json");
      assertSpyCallArg(mockReadJsonFile, 0, 2, OAuthClientInformationSchema);

      // Check constructor call too
      assertSpyCalls(mockGetServerUrlHash, 1);
    });

    it("returns undefined when client information doesn't exist", async () => {
      // Default mockReadJsonFile returns undefined, so no need to reset it
      const specificReadJsonMockUndef = spy(() => Promise.resolve(undefined));
      mockReadJsonFile = specificReadJsonMockUndef as unknown as MockFn<
        typeof McpAuthTypes.readJsonFile
      >;
      mockDeps.readJsonFile = mockReadJsonFile;

      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);
      const result = await provider.clientInformation();

      assertEquals(result, undefined);
      assertSpyCalls(mockReadJsonFile, 1);

      // Check constructor call too
      assertSpyCalls(mockGetServerUrlHash, 1);
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

      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);
      await provider.saveClientInformation(mockClientInfo);

      assertSpyCalls(mockWriteJsonFile, 1);
      assertSpyCallArg(mockWriteJsonFile, 0, 0, testServerUrlHash);
      assertSpyCallArg(mockWriteJsonFile, 0, 1, "client_info.json");
      assertSpyCallArg(mockWriteJsonFile, 0, 2, mockClientInfo);

      // Check constructor call too
      assertSpyCalls(mockGetServerUrlHash, 1);
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

      // Set up mock return value for this test case
      const specificReadJsonMockTokens = spy(() => Promise.resolve(mockTokens));
      mockReadJsonFile = specificReadJsonMockTokens as unknown as MockFn<
        typeof McpAuthTypes.readJsonFile
      >;
      mockDeps.readJsonFile = mockReadJsonFile;

      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);
      const result = await provider.tokens();

      assertEquals(result, mockTokens);
      assertSpyCalls(mockReadJsonFile, 1);
      assertSpyCallArg(mockReadJsonFile, 0, 0, testServerUrlHash);
      assertSpyCallArg(mockReadJsonFile, 0, 1, "tokens.json");
      assertSpyCallArg(mockReadJsonFile, 0, 2, OAuthTokensSchema);

      // Check constructor call too
      assertSpyCalls(mockGetServerUrlHash, 1);
    });

    it("returns undefined when tokens don't exist", async () => {
      // Default mockReadJsonFile returns undefined
      const specificReadJsonMockUndef2 = spy(() => Promise.resolve(undefined));
      mockReadJsonFile = specificReadJsonMockUndef2 as unknown as MockFn<
        typeof McpAuthTypes.readJsonFile
      >;
      mockDeps.readJsonFile = mockReadJsonFile;

      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);
      const result = await provider.tokens();

      assertEquals(result, undefined);
      assertSpyCalls(mockReadJsonFile, 1);

      // Check constructor call too
      assertSpyCalls(mockGetServerUrlHash, 1);
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

      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);
      await provider.saveTokens(mockTokens);

      assertSpyCalls(mockWriteJsonFile, 1);
      assertSpyCallArg(mockWriteJsonFile, 0, 0, testServerUrlHash);
      assertSpyCallArg(mockWriteJsonFile, 0, 1, "tokens.json");
      assertSpyCallArg(mockWriteJsonFile, 0, 2, mockTokens);

      // Check constructor call too
      assertSpyCalls(mockGetServerUrlHash, 1);
    });
  });

  describe("redirectToAuthorization", () => {
    it("logs the authorization URL and opens browser successfully", async () => {
      const authUrl = new URL(
        "https://auth.example.com/authorize?client_id=test",
      );

      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);
      await provider.redirectToAuthorization(authUrl);

      // Should log twice: the URL and the success message
      assertSpyCalls(mockLog, 2);
      // Manually check the first log call's argument
      const firstCallArgsSuccess = mockLog.calls[0].args;
      assert(typeof firstCallArgsSuccess[0] === "string");
      assertMatch(
        firstCallArgsSuccess[0],
        /Please authorize this client by visiting:/,
      );
      assertSpyCallArg(mockLog, 1, 0, "Browser opened automatically.");

      // Check if open was called
      assertSpyCalls(mockOpen, 1);
      assertSpyCallArg(mockOpen, 0, 0, authUrl.toString());

      // Check constructor call too
      assertSpyCalls(mockGetServerUrlHash, 1);
    });

    it("logs a fallback message when browser can't be opened", async () => {
      const authUrl = new URL(
        "https://auth.example.com/authorize?client_id=test",
      );

      // Make the mock open function throw an error
      mockOpen = spy(() => Promise.reject(new Error("Failed to open browser")));
      mockDeps.open = mockOpen;

      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);
      await provider.redirectToAuthorization(authUrl);

      // Should log twice: the URL and the fallback message
      assertSpyCalls(mockLog, 2);
      // Manually check the first log call's argument
      const firstCallArgsFallback = mockLog.calls[0].args;
      assert(typeof firstCallArgsFallback[0] === "string");
      assertMatch(
        firstCallArgsFallback[0],
        /Please authorize this client by visiting:/,
      );
      assertSpyCallArg(
        mockLog,
        1,
        0,
        "Could not open browser automatically. Please copy and paste the URL above into your browser.",
      );

      // Check if open was called (and failed)
      assertSpyCalls(mockOpen, 1);

      // Check constructor call too
      assertSpyCalls(mockGetServerUrlHash, 1);
    });
  });

  describe("saveCodeVerifier", () => {
    it("saves the code verifier", async () => {
      const codeVerifier = "test-code-verifier";

      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);
      await provider.saveCodeVerifier(codeVerifier);

      assertSpyCalls(mockWriteTextFile, 1);
      assertSpyCallArg(mockWriteTextFile, 0, 0, testServerUrlHash);
      assertSpyCallArg(mockWriteTextFile, 0, 1, "code_verifier.txt");
      assertSpyCallArg(mockWriteTextFile, 0, 2, codeVerifier);

      // Check constructor call too
      assertSpyCalls(mockGetServerUrlHash, 1);
    });
  });

  describe("codeVerifier", () => {
    it("returns the code verifier when it exists", async () => {
      const codeVerifier = "test-code-verifier";

      // Set up mock return value
      mockReadTextFile = spy(() => Promise.resolve(codeVerifier));
      mockDeps.readTextFile = mockReadTextFile;

      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);
      const result = await provider.codeVerifier();

      assertEquals(result, codeVerifier);
      assertSpyCalls(mockReadTextFile, 1);
      assertSpyCallArg(mockReadTextFile, 0, 0, testServerUrlHash);
      assertSpyCallArg(mockReadTextFile, 0, 1, "code_verifier.txt");
      assertSpyCallArg(
        mockReadTextFile,
        0,
        2,
        "No code verifier saved for session",
      );

      // Check constructor call too
      assertSpyCalls(mockGetServerUrlHash, 1);
    });

    it("throws an error when the code verifier doesn't exist", async () => {
      // Default mock throws error, so no need to change it
      const errorMsg = "No code verifier saved for session";
      mockReadTextFile = spy(() => Promise.reject(new Error(errorMsg)));
      mockDeps.readTextFile = mockReadTextFile;

      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);

      await assertRejects(
        () => provider.codeVerifier(),
        Error,
        errorMsg,
      );

      assertSpyCalls(mockReadTextFile, 1);

      // Check constructor call too
      assertSpyCalls(mockGetServerUrlHash, 1);
    });
  });

  // Integration test simulation using mocks
  describe("integration simulation", () => {
    it("performs full OAuth workflow correctly using mocks", async () => {
      // Setup specific mock returns if needed, otherwise defaults are used
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

      const provider = new NodeOAuthClientProvider(testOptions, mockDeps);

      // Execute workflow steps
      await provider.saveClientInformation(clientInfo);
      await provider.saveTokens(tokens);
      await provider.saveCodeVerifier(codeVerifier);

      // Test redirect to authorization
      const authUrl = new URL(
        "https://auth.example.com/authorize?client_id=test",
      );
      await provider.redirectToAuthorization(authUrl);

      // Verify mock calls
      assertSpyCalls(mockGetServerUrlHash, 1); // Constructor
      assertSpyCalls(mockWriteJsonFile, 2); // client info and tokens
      assertSpyCallArg(mockWriteJsonFile, 0, 2, clientInfo);
      assertSpyCallArg(mockWriteJsonFile, 1, 2, tokens);
      assertSpyCalls(mockWriteTextFile, 1); // code verifier
      assertSpyCallArg(mockWriteTextFile, 0, 2, codeVerifier);
      assertSpyCalls(mockLog, 2); // Redirect log
      assertSpyCalls(mockOpen, 1); // browser open
    });
  });
});

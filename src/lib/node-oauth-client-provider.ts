import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import "@modelcontextprotocol/sdk/client/auth.js";
import {
  OAuthClientInformationSchema,
  OAuthTokensSchema,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthProviderOptions } from "./types.ts";
import * as mcpAuth from "./mcp-auth-config.ts";
import * as utils from "./utils.ts";
import * as openModule from "./deno-open.ts";

/**
 * Interface defining the dependencies for NodeOAuthClientProvider,
 * allowing for injection during testing.
 */
export interface NodeOAuthClientProviderDeps {
  getServerUrlHash: typeof utils.getServerUrlHash;
  readJsonFile: typeof mcpAuth.readJsonFile;
  writeJsonFile: typeof mcpAuth.writeJsonFile;
  readTextFile: typeof mcpAuth.readTextFile;
  writeTextFile: typeof mcpAuth.writeTextFile;
  log: typeof utils.log;
  open: typeof openModule.default;
  mcpRemoteVersion: string;
}

/**
 * Implements the OAuthClientProvider interface for Node.js environments.
 * Handles OAuth flow and token storage for MCP clients.
 */
export class NodeOAuthClientProvider implements OAuthClientProvider {
  private serverUrlHash: string;
  private callbackPath: string;
  private clientName: string;
  private clientUri: string;
  private softwareId: string;

  // Store dependencies internally
  private deps: NodeOAuthClientProviderDeps;

  /**
   * Creates a new NodeOAuthClientProvider
   * @param options Configuration options for the provider
   * @param deps Optional dependencies for testing
   */
  constructor(
    readonly options: OAuthProviderOptions,
    deps?: Partial<NodeOAuthClientProviderDeps>,
  ) {
    // Use provided dependencies or default to actual implementations
    this.deps = {
      getServerUrlHash: deps?.getServerUrlHash ?? utils.getServerUrlHash,
      readJsonFile: deps?.readJsonFile ?? mcpAuth.readJsonFile,
      writeJsonFile: deps?.writeJsonFile ?? mcpAuth.writeJsonFile,
      readTextFile: deps?.readTextFile ?? mcpAuth.readTextFile,
      writeTextFile: deps?.writeTextFile ?? mcpAuth.writeTextFile,
      log: deps?.log ?? utils.log,
      open: deps?.open ?? openModule.default,
      mcpRemoteVersion: deps?.mcpRemoteVersion ?? utils.MCP_REMOTE_VERSION,
    };

    this.serverUrlHash = this.deps.getServerUrlHash(options.serverUrl);
    this.callbackPath = options.callbackPath || "/oauth/callback";
    this.clientName = options.clientName || "MCP CLI Client";
    this.clientUri = options.clientUri ||
      "https://github.com/modelcontextprotocol/mcp-cli";
    this.softwareId = options.softwareId ||
      "2e6dc280-f3c3-4e01-99a7-8181dbd1d23d";
  }

  get redirectUrl(): string {
    return `http://127.0.0.1:${this.options.callbackPort}${this.callbackPath}`;
  }

  get clientMetadata() {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: this.clientName,
      client_uri: this.clientUri,
      software_id: this.softwareId,
      software_version: this.options.softwareVersion ??
        this.deps.mcpRemoteVersion,
    };
  }

  /**
   * Gets the client information if it exists
   * @returns The client information or undefined
   */
  clientInformation(): Promise<OAuthClientInformation | undefined> {
    // log('Reading client info')
    return this.deps.readJsonFile<OAuthClientInformation>(
      this.serverUrlHash,
      "client_info.json",
      OAuthClientInformationSchema,
    );
  }

  /**
   * Saves client information
   * @param clientInformation The client information to save
   */
  async saveClientInformation(
    clientInformation: OAuthClientInformationFull,
  ): Promise<void> {
    // log('Saving client info')
    await this.deps.writeJsonFile(
      this.serverUrlHash,
      "client_info.json",
      clientInformation,
    );
  }

  /**
   * Gets the OAuth tokens if they exist
   * @returns The OAuth tokens or undefined
   */
  tokens(): Promise<OAuthTokens | undefined> {
    // log('Reading tokens')
    // console.log(new Error().stack)
    return this.deps.readJsonFile<OAuthTokens>(
      this.serverUrlHash,
      "tokens.json",
      OAuthTokensSchema,
    );
  }

  /**
   * Saves OAuth tokens
   * @param tokens The tokens to save
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    // log('Saving tokens')
    await this.deps.writeJsonFile(this.serverUrlHash, "tokens.json", tokens);
  }

  /**
   * Redirects the user to the authorization URL
   * @param authorizationUrl The URL to redirect to
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.deps.log(
      `\nPlease authorize this client by visiting:\n${authorizationUrl.toString()}\n`,
    );
    try {
      await this.deps.open(authorizationUrl.toString());
      this.deps.log("Browser opened automatically.");
    } catch (_error) {
      this.deps.log(
        "Could not open browser automatically. Please copy and paste the URL above into your browser.",
      );
    }
  }

  /**
   * Saves the PKCE code verifier
   * @param codeVerifier The code verifier to save
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    // log('Saving code verifier')
    await this.deps.writeTextFile(
      this.serverUrlHash,
      "code_verifier.txt",
      codeVerifier,
    );
  }

  /**
   * Gets the PKCE code verifier
   * @returns The code verifier
   */
  async codeVerifier(): Promise<string> {
    // log('Reading code verifier')
    return await this.deps.readTextFile(
      this.serverUrlHash,
      "code_verifier.txt",
      "No code verifier saved for session",
    );
  }
}

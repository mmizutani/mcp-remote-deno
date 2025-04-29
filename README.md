# mcp-remote-deno

Connect local MCP (Model Context Protocol) clients (like Claude Desktop, Cursor) that only support stdio connections to remote MCP servers using HTTP+SSE and OAuth authentication. This is a Deno port of the original [mcp-remote](https://github.com/geelen/mcp-remote) npm package, designed to run within the Deno runtime.

## Features

- **Bridges local stdio MCP clients** (like Claude Desktop, Cursor) to remote **HTTP+SSE MCP servers**.
- **Fully implements OAuth 2.1 authentication flow**
- **Runs natively in the Deno runtime** (no Node.js/npm needed for the proxy itself).
- **Supports sending custom HTTP headers** to the remote server (e.g., for API keys or bypassing auth).
- **Includes a standalone client mode** (`jsr:@mmizutani/mcp-remote-deno/client`) for testing and debugging connections directly, bypassing the need for an MCP client.
- **Allows insecure HTTP connections** to the remote server via the `--allow-http` flag (use with caution in trusted networks only).
- **Clean and simple command-line interface.**

## Why is this necessary?

### Why **Remote** MCP Servers?

So far, the majority of MCP servers in the wild are installed locally, using the stdio transport. This has some benefits: both the client and the server can implicitly trust each other as the user has granted them both permission to run. Adding secrets like API keys can be done using environment variables and never leave your machine.

But there's a reason most software that _could_ be moved to the web _did_ get moved to the web: it's so much easier to find and fix bugs & iterate on new features when you can push updates to all your users with a single deploy. Remote MCP servers allow for centralized deployment, maintenance, and scaling of services independently from client capabilities.

### The STDIO to HTTP+SSE Protocol Challenge

With the latest MCP Authorization specification, we now have a secure way of sharing our MCP servers with the world _without_ running code on user's laptops. Or at least, you would, if all the popular MCP _clients_ supported it yet. Most are stdio-only, and those that _do_ support HTTP+SSE don't yet support the OAuth flows required.

Currently, there is only a handful of MCP client implementations that fully support both STDIO transport and HTTP+SSE (Server-Side Events) transport, as can be seen in the [MCP client details](https://modelcontextprotocol.io/clients#client-details). Popular clients like Cursor, Claude Desktop, and many others still primarily rely on STDIO transport or only partially support HTTP+SSE and their SSE handling can sometimes be unstable.

That's where `mcp-remote-deno` comes in. As soon as your chosen MCP client supports remote, authorized servers, you can remove it. Until that time, this tool bridges the gap to allow connection to remote MCP servers.

### The OAuth Authentication Solution

For remote MCP servers to be secure, they need proper authentication. The MCP specification includes OAuth authentication flows that allow clients to securely connect to remote servers without exposing API keys or credentials.

This proxy fully implements the [MCP Authorization specification (draft)](https://modelcontextprotocol.io/specification/draft/basic/authorization) which requires OAuth 2.1 with appropriate security measures. The implementation leverages the `@modelcontextprotocol/sdk` package while providing all necessary components to fulfill the complete OAuth 2.1 specification, including:

This proxy acts as an OAuth 2.1 client** (as defined in [OAuth 2.1 Roles](https://www.ietf.org/archive/id/draft-ietf-oauth-v2-1-12.html#name-roles)) for protected remote MCP Resource servers
It implements the MCP Authorization server specification as defined in the [MCP Authorization specification](https://modelcontextprotocol.io/specification/draft/basic/authorization)
It uses the OAuth Authorization Code grant type as recommended by the [MCP specification](https://modelcontextprotocol.io/specification/draft/basic/authorization#2-1-1-oauth-grant-types) for clients acting on behalf of a human end user

The proxy handles the entire authentication flow, including:

- Handles the OAuth 2.1 authorization code flow with mandatory PKCE for enhanced security
- Implements server metadata discovery following RFC8414
- Falls back to default endpoints when metadata discovery is unavailable
- Securely stores tokens and PKCE code verifiers following OAuth best practices
- Uses the required `Authorization: Bearer <token>` header format
- Manages token lifecycle including expiration and renewal
- Enforces strict redirect URI matching to prevent open redirect vulnerabilities
- Avoids deprecated grant types like implicit flow and password grant
- Storing and retrieving PKCE code verifiers

This proxy handles the entire authentication flow, including opening the browser for user login, managing the token exchange, and maintaining the secure connection.

#### OAuth vs. Static Credentials

Many simpler MCP servers rely on static authentication credentials (like API keys) passed through authorization headers. While easier to implement, these approaches have significant limitations compared to OAuth:

| Static Credentials | OAuth 2.1 |
| --- | --- |
| Credentials rarely rotate, increasing risk if compromised | Short-lived access tokens with automatic expiration |
| No granular permission control | Scope-based access with fine-grained permissions |
| No standardized way to revoke access | Token revocation capabilities |
| User must manually manage credentials | Automated credential management and refresh |
| No explicit consent flow | User explicitly approves access and scope |
| No separation between authentication and authorization | Clear separation of concerns with standardized flows |

The OAuth approach implemented in this proxy offers significant security benefits while also providing a better user experience through standardized browser-based authentication flows.

### Secure Storage of OAuth Credentials

This proxy requires write access to `~/.mcp-auth` to securely store authentication data:

- **Version-specific subdirectories**: Credentials are stored in `~/.mcp-auth/mcp-remote-deno-VERSION/` to maintain compatibility across proxy versions
- **Server-specific files**: Each remote server's credentials are stored in files prefixed with a hash of the server URL (e.g., `bd22cb7e2c2f413e874364f5baa5ab5f_tokens.json`)
- **Segregated credential storage**: For each server, the proxy maintains separate files for:
  - OAuth client information (`*_client_info.json`)
  - Access and refresh tokens (`*_tokens.json`)
  - PKCE code verifiers (`*_code_verifier.txt`)
  - Process lock files (`*_lock.json`) to prevent concurrent operations

This structured approach ensures that:

1. Credentials for different servers don't interfere with each other
2. Token refreshes can occur safely without file corruption
3. Multiple instances of the proxy can coordinate through lock files

**That's why the `--allow-write="$HOME/.mcp-auth"` Deno permission is required** in all usage examples.

You can set the `MCP_REMOTE_CONFIG_DIR` environment variable to point to a different directory for storing the credentials if necessary.

### Why Deno's Security Sandbox for Implementation

This implementation specifically leverages Deno's security-first approach, which requires explicit permissions for file, network, and environment access. This is particularly important for MCP clients, which often handle sensitive API keys and user data. With Deno, you can precisely control which domains the proxy can connect to, which files it can access, and what system operations it can perform - making it a more secure alternative to Node.js implementations. This approach was inspired by similar projects like [@yamanoku/baseline-mcp-server](https://github.com/yamanoku/baseline-mcp-server), which demonstrates how Deno's sandboxed security model can be effectively leveraged for MCP implementations.

## Usage for End Users

### Prerequisites

Deno is required for both using this tool and building it.

- [Deno](https://deno.com/)

### Installation

No installation is needed if you have [Deno](https://deno.com/) installed. You can run the package directly from JSR (Deno's package registry).


### Running Directly from JSR

You can run the proxy directly using `deno run` with the JSR package:

```bash
deno run \
  --allow-env='MCP_REMOTE_CONFIG_DIR' \
  --allow-read \
  --allow-sys=homedir \
  --allow-run=open \
  --allow-write="$HOME/.mcp-auth" \
  --allow-net=0.0.0.0,127.0.0.1,localhost,remote.mcp.server.example.com \
  jsr:@mmizutani/mcp-remote-deno \
  https://remote.mcp.server.example.com/sse \
  [callback-port]
```

Replace `remote.mcp.server.example.com` with the actual domain of your remote MCP server.

**Arguments:**

- First positional argument: The URL of the remote MCP server (required)
- Second positional argument: Local port for OAuth callback (optional, defaults to 3334)
- `--header "Name: Value"`: Custom HTTP headers to send (optional, can be repeated)

**Security Permissions:**

The security flags in the command are carefully chosen to balance functionality with the principle of least privilege:

- `--allow-write="$HOME/.mcp-auth"` permits storage of OAuth tokens and synchronization lockfiles in your home directory
- `--allow-net=...` restricts network access to only localhost and the specific remote server
- Other permissions enable minimal required functionality while maintaining security

**Examples:**

```bash
# Basic usage
deno run \
  --allow-env='MCP_REMOTE_CONFIG_DIR' \
  --allow-read \
  --allow-sys=homedir \
  --allow-run=open \
  --allow-write="$HOME/.mcp-auth" \
  --allow-net=0.0.0.0,127.0.0.1,localhost,remote.mcp.server.example.com \
  jsr:@mmizutani/mcp-remote-deno https://remote.mcp.server.example.com/sse

# Custom callback port (8080)
deno run \
  --allow-env='MCP_REMOTE_CONFIG_DIR' \
  --allow-read \
  --allow-sys=homedir \
  --allow-run=open \
  --allow-write="$HOME/.mcp-auth" \
  --allow-net=0.0.0.0,127.0.0.1,localhost,remote.mcp.server.example.com \
  jsr:@mmizutani/mcp-remote-deno https://remote.mcp.server.example.com/sse 8080

# With custom headers
deno run \
  --allow-env='MCP_REMOTE_CONFIG_DIR' \
  --allow-read \
  --allow-sys=homedir \
  --allow-run=open \
  --allow-write="$HOME/.mcp-auth" \
  --allow-net=0.0.0.0,127.0.0.1,localhost,remote.mcp.server.example.com \
  jsr:@mmizutani/mcp-remote-deno \
   --header "Authorization: Bearer mytoken" \
  https://remote.mcp.server.example.com/sse
```

### Setting Up Your MCP Client

To configure your MCP client to use this proxy, you'll need to modify the configuration file of your MCP client (such as Cursor, Cline, and Claude Desktop).

#### Cursor

Edit `~/.cursor/mcp.json` (create it if it doesn't exist):

```json
{
  "mcpServers": {
    "${mcpServerName}": {
      "type": "stdio",
      "command": "deno",
      "args": [
        "run",
        "--allow-env='MCP_REMOTE_CONFIG_DIR'",
        "--allow-read",
        "--allow-sys=homedir",
        "--allow-run=open",
        "--allow-write=\"$HOME/.mcp-auth\"",
        "--allow-net=0.0.0.0,127.0.0.1,localhost,remote.mcp.server.example.com",
        "jsr:@mmizutani/mcp-remote-deno",
        "https://remote.mcp.server.example.com/sse"
      ]
    }
  }
}
```

Replace `${mcpServerName}` with a unique name for your remote MCP server, and update the URL in the last argument to point to your actual remote MCP server endpoint.

See [Use MCP servers in Cursor](https://docs.cursor.com/context/model-context-protocol) for more details.

#### Claude Desktop

Edit the configuration at:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

If it does not exist yet, [you may need to enable it under Settings > Developer](https://modelcontextprotocol.io/quickstart/user#2-add-the-filesystem-mcp-server).

```json
{
  "mcpServers": {
    "${mcpServerName}": {
      "command": "deno",
      "args": [
        "run",
        "--allow-env='MCP_REMOTE_CONFIG_DIR'",
        "--allow-read",
        "--allow-sys=homedir",
        "--allow-run=open",
        "--allow-write=\"$HOME/.mcp-auth\"",
        "--allow-net=0.0.0.0,127.0.0.1,localhost,remote.mcp.server.example.com",
        "jsr:@mmizutani/mcp-remote-deno",
        "https://remote.mcp.server.example.com/sse"
      ]
    }
  }
}
```

Restart Claude Desktop after making changes to the configuration file.

See [Use MCP servers in Claude Desktop](https://modelcontextprotocol.io/quickstart/user) for more details.

#### Visual Studio GitHub Copilot

Edit `.vscode/mcp.json` in your project workspace:

```json
{
  "inputs": [],
  "servers": {
    "${mcpServerName}": {
      "type": "stdio",
      "command": "deno",
      "args": [
        "run",
        "--allow-env",
        "--allow-read",
        "--allow-sys=homedir",
        "--allow-run=open",
        "--allow-write=\"$HOME/.mcp-auth\"",
        "--allow-net=0.0.0.0,127.0.0.1,localhost,remote.mcp.server.example.com",
        "jsr:@mmizutani/mcp-remote-deno",
        "https://remote.mcp.server.example.com/sse"
      ]
    }
  }
}
```

or your user settings`settings.json`

```json
{
  "mcp": {
    "servers": {
      "${mcpServerName}": {
        "type": "stdio",
        "command": "deno",
        "args": [
          "run",
          "--allow-env='MCP_REMOTE_CONFIG_DIR'",
          "--allow-read",
          "--allow-sys=homedir",
          "--allow-run=open",
          "--allow-write=\"$HOME/.mcp-auth\"",
          "--allow-net=0.0.0.0,127.0.0.1,localhost,remote.mcp.server.example.com",
          "jsr:@mmizutani/mcp-remote-deno",
          "https://remote.mcp.server.example.com/sse"
        ]
      }
    }
  }
}
```

See [Use MCP servers in VS Code (Preview)](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) for more details.

**Important Notes:**

1. Replace `remote.mcp.server.example.com` with your actual server domain in both the `--allow-net` flag and the server URL
2. Replace `my-remote-server` with your preferred name for the server
3. Restart your MCP client after making these changes

### Library API

You can also use the library programmatically in your Deno projects:

```typescript
import { startProxy, runProxy } from "jsr:@mmizutani/mcp-remote-deno@^100.1";

// Using the wrapped function
await startProxy("https://remote.mcp.server.example.com", 3334, {
  "Authorization": "Bearer token"
});

// Or using the direct import from mcp-use
await runProxy("https://remote.mcp.server.example.com", 3334, {
  "Authorization": "Bearer token"
});
```

## How It Works

This project uses Deno's NPM compatibility feature to directly import and use the `mcp-use` NPM package without the need for running Node.js in a subprocess or container. It wraps the functionality in a Deno-friendly API with TypeScript type definitions.

### Bidirectional Proxying Explained

The core functionality relies on establishing communication channels based on two different MCP transport specifications across three components:

1. **MCP Host (Cursor) <-> Local MCP Client:**
    - The MCP Host (such as Cursor IDE) contains an embedded MCP Client that communicates with MCP Servers.
    - The Host application provides the user interface and LLM integration capabilities.

2. **Local MCP Client <-> Local MCP Proxy Server:**
    - The proxy uses STDIO transport (stdin/stdout) for communication with the local MCP client.
    - The local MCP client sends messages to the proxy via stdout, which the proxy reads from stdin.
    - The proxy sends messages to the local client via stdout, which the client reads from stdin.
    - This follows the MCP STDIO transport specification where messages are delimited by newlines.

3. **Local MCP Proxy Server <-> Remote SSE MCP Server:**
    - The proxy makes an initial HTTP connection to the remote SSE MCP server specified by the `<server-url>` argument to establish an SSE connection. Any custom headers provided via the `--header` flag are sent during this setup.
    - The proxy receives messages *from* the remote server via this SSE connection.
    - The proxy sends messages *to* the remote server via HTTP POST requests to the endpoint provided by the server during the initial handshake.

Once all connections are established, the proxy relays messages across the entire chain:

- The **MCP Host** initiates requests through the **Local MCP Client**.
- Messages received via stdin from the **Local MCP Client** are forwarded as HTTP POST messages to the **Remote SSE MCP Server**.
- SSE messages received from the **Remote SSE MCP Server** are forwarded via stdout to the **Local MCP Client**.
- The **Local MCP Client** delivers responses back to the **MCP Host**.

This creates a transparent bridge, allowing your MCP Host (such as Cursor) to communicate with the remote SSE MCP server, effectively translating between the STDIO and HTTP+SSE transport mechanisms defined in the MCP specification.

The proxy also handles OAuth authentication with the remote MCP server, by listening for redirects at the callback port (default 3334) on the `/oauth/callback` path.

```mermaid
sequenceDiagram
    participant Host as MCP Host
    participant Client as Local MCP Client
    participant Proxy as Local MCP Proxy Server (mcp-remote-deno)
    participant Server as Remote SSE MCP Server
    participant Browser as Web Browser

    Host->>Client: Initialize connection
    Client->>+Proxy: STDIO connection (stdin/stdout)
    Proxy-->>-Client: STDIO connection established

    Note over Proxy,Server: OAuth 2.1 Authentication Flow (if required)
    Proxy->>Proxy: Start local server on callback port (default 3334)
    Proxy->>+Server: Request authorization
    Server-->>-Proxy: Return authorization URL
    Proxy->>Browser: Open authorization URL in browser
    Browser->>Server: User authenticates
    Server->>Browser: Redirects with auth code
    Browser->>Proxy: Request to /oauth/callback with auth code
    Proxy->>+Server: Exchange auth code for tokens
    Server-->>-Proxy: Return access token

    Note over Proxy,Server: Normal Operation After Auth
    Proxy->>+Server: GET / (Establish SSE connection, <server-url>, Headers)
    Server-->>-Proxy: SSE stream opened, provides POST endpoint (/server-post)

    loop Message Exchange
        Host->>Client: Request function/capability
        Client->>Proxy: Write to Proxy's stdin (MCP Request)
        Proxy->>Server: POST /server-post (Forwarded MCP Request)
        Server-->>Proxy: SSE event (MCP Response/Notification)
        Proxy-->>Client: Write to Client's stdin (Forwarded MCP Response/Notification)
        Client-->>Host: Deliver response/notification

        Server-->>Proxy: SSE event (MCP Request/Notification)
        Proxy-->>Client: Write to Client's stdin (Forwarded MCP Request/Notification)
        Client-->>Host: Deliver request/notification
        Host->>Client: Process and respond
        Client->>Proxy: Write to Proxy's stdin (MCP Response)
        Proxy->>Server: POST /server-post (Forwarded MCP Response)
    end

    Host->>Client: Close Connection
    Client->>Proxy: Close STDIO connection
    Proxy->>Server: Close HTTP connection
    Server-->>Proxy: Connection Closed
    Proxy-->>Client: STDIO connection closed
    Client-->>Host: Connection Closed
```

If either the client or the server disconnects, the proxy ensures the other connection is also terminated gracefully.

## Troubleshooting

### Clear your `~/.mcp-auth` directory

`mcp-remote-deno` stores credential information inside `~/.mcp-auth`. If you're having persistent issues, try running:

```sh
rm -rf ~/.mcp-auth
```

This will remove all stored OAuth credentials, forcing a fresh authentication flow the next time you connect. Common situations where clearing this directory helps:

- When you receive OAuth token errors or authentication failures
- After changing the remote server's authentication mechanisms
- If you see "Token exchange failed: HTTP 400" errors
- When a process lock file is preventing new connections

Then restart your MCP client.

### Check your Deno version

Make sure you have a recent version of Deno installed:

```sh
deno --version
```

Update Deno if needed:

```sh
deno upgrade
```

### VPN Certificates

If you are behind a VPN and encounter certificate issues, you may need to specify certificate authority files. Set the appropriate environment variables in your MCP client configuration:

```json
{
 "mcpServers": {
    "remote-example": {
      "command": "deno",
      "args": [
        "run",
        "--allow-env='MCP_REMOTE_CONFIG_DIR'",
        "--allow-read",
        "--allow-sys=homedir",
        "--allow-run=open",
        "--allow-write=\"$HOME/.mcp-auth\"",
        "--allow-net=0.0.0.0,127.0.0.1,localhost,remote.mcp.server.example.com",
        "--cert=/path/to/your/cert.pem",
        "jsr:@mmizutani/mcp-remote-deno",
        "https://remote.mcp.server.example.com/sse"
      ]
    }
  }
}
```

### Check the logs

- [Follow Claude Desktop logs in real-time](https://modelcontextprotocol.io/docs/tools/debugging#debugging-in-claude-desktop)
- MacOS / Linux: `tail -n 20 -F ~/Library/Logs/Claude/mcp*.log`
- For bash on WSL: `tail -n 20 -f "C:\Users\YourUsername\AppData\Local\Claude\Logs\mcp.log"`
- Powershell: `Get-Content "C:\Users\YourUsername\AppData\Local\Claude\Logs\mcp.log" -Wait -Tail 20`

## Debugging

If you encounter the following error, returned by the `/callback` URL:

```
Authentication Error
Token exchange failed: HTTP 400
```

You can run `rm -rf ~/.mcp-auth` to clear any locally stored state and tokens.

### Inspecting OAuth Credential Files

To check what credential information is stored for your MCP connections:

```sh
# List all version-specific credential directories
ls -la ~/.mcp-auth/

# View contents of a specific version directory
ls -la ~/.mcp-auth/mcp-remote-deno-0.0.1/

# Examine a specific server's credentials (the hash prefix will vary)
cat ~/.mcp-auth/mcp-remote-deno-0.0.1/[hash]_client_info.json
cat ~/.mcp-auth/mcp-remote-deno-0.0.1/[hash]_tokens.json
cat ~/.mcp-auth/mcp-remote-deno-0.0.1/[hash]_code_verifier.txt
```

Each remote server will have multiple files with the same hash prefix, storing different aspects of the OAuth session. In most cases, you shouldn't need to manually modify these files.

### Client Mode

The `mcp-remote-deno` package also provides a client mode (standalone MCP client) that can be used to test your connection directly.

Run the following command to test your connection directly:

```shell
deno run \
  --allow-env='MCP_REMOTE_CONFIG_DIR' \
  --allow-read \
  --allow-sys=homedir \
  --allow-run=open \
  --allow-write="$HOME/.mcp-auth" \
  --allow-net=0.0.0.0,127.0.0.1,localhost,remote.mcp.server.example.com \
  jsr:@mmizutani/mcp-remote-deno/client \
  https://remote.mcp.server.example.com/sse
```

This will run through the entire authorization flow and attempt to list the tools & resources at the remote URL. Try this after running `rm -rf ~/.mcp-auth` to see if stale credentials are your problem.

## Development

### Running with `deno task` (Recommended)

If you have cloned the repository, you can use the predefined Deno task:

```bash
# Basic usage: Connects to the server and listens on default port 3334 for OAuth redirects
deno task proxy:start <server-url>

# Example:
deno task proxy:start https://remote.mcp.server.example.com

# Specify a custom local port for OAuth redirects:
deno task proxy:start <server-url> [callback-port]

# Example with custom port 8080:
deno task proxy:start <server-url> 8080

# Include custom HTTP headers for the connection to the remote server:
deno task proxy:start <server-url> [callback-port] --header "Header-Name: Header-Value" --header "Another: Value"

# Example with headers:
deno task proxy:start https://remote.mcp.server.example.com 3334 --header "Authorization: Bearer mytoken" --header "X-Custom-ID: 12345"
```

**Arguments:**

- `<server-url>`: (Required) The URL of the remote MCP server you want to connect to.
- `[callback-port]`: (Optional) The local port the proxy should listen on for OAuth redirects from the remote MCP server. Defaults to `3334`. Note that if the specified port is unavailable, an open port will be chosen at random.
- `--header "Name: Value"`: (Optional, repeatable) Custom HTTP headers to send to the remote MCP server during the initial connection.

### Running with `deno run`

You can also run the proxy script directly using `deno run`. This requires specifying the necessary permissions precisely.

```bash
# Define permissions based on deno.json task
DENO_PERMISSIONS="--allow-env='MCP_REMOTE_CONFIG_DIR' --allow-read --allow-sys=homedir --allow-run=open --allow-write=\"$HOME/.mcp-auth/mcp-remote-deno-0.0.1\" --allow-net=0.0.0.0,127.0.0.1,localhost,remote.mcp.server.example.com"

# Basic usage with specific permissions:
deno run $DENO_PERMISSIONS src/proxy.ts <server-url> [callback-port]

# Example:
deno run $DENO_PERMISSIONS src/proxy.ts https://remote.mcp.server.example.com

# Example with custom port and headers:
deno run $DENO_PERMISSIONS src/proxy.ts https://remote.mcp.server.example.com 8080 --header "Authorization: Bearer mytoken"
```

### Development Workflow

```bash
# Run in development mode with auto-reload
deno task dev https://remote.mcp.server.example.com

# Check types
deno task check

# Format code
deno fmt
```

### Building Remote MCP Servers

For instructions on building & deploying remote MCP servers, including acting as a valid OAuth client, see these resources:

- <https://developers.cloudflare.com/agents/guides/remote-mcp-server/>
- <https://github.com/cloudflare/workers-oauth-provider> - For defining an MCP-compliant OAuth server in Cloudflare Workers
- <https://github.com/cloudflare/agents/tree/main/examples/mcp> - For defining an `McpAgent` using the [`agents`](https://npmjs.com/package/agents) framework
- <https://developers.cloudflare.com/agents/guides/test-remote-mcp-server/> - For testing remote MCP servers
- <https://modelcontextprotocol.io/specification/draft/basic/authorization> - For specification of authorization flow for MCP servers

## Acknowledgements

This project would not be possible without these excellent open source projects:

- [mcp-remote](https://www.npmjs.com/package/mcp-remote) - The original NPM package that this Deno wrapper is based on. Created by Glen Maddern (@geelen), mcp-remote pioneered the approach of connecting local stdio-based MCP clients (like Cursor, Cline and Claude Desktop) to remote MCP servers over HTTP+SSE. It handles the complex OAuth authentication flow and bidirectional proxying between different transport protocols, forming the foundational architecture that this Deno implementation builds upon.

- [@yamanoku/baseline-mcp-server](https://jsr.io/@yamanoku/baseline-mcp-server) - Developed by Okuto Oyama (@yamanoku), this project provided inspiration for implementing an MCP server within Deno's secure runtime environment. Its clean architecture and approach to permission management exemplifies how to properly leverage Deno's sandbox security model while maintaining full compatibility with the MCP specification.

## License

MIT - See the [LICENSE](LICENSE) file for details.

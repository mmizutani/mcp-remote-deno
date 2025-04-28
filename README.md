# mcp-remote-deno

A Deno wrapper for the [mcp-use](https://github.com/geelen/mcp-remote) proxy server that connects to remote MCP (Model Context Protocol) servers.

## Features

- Runs natively in Deno, utilizing NPM compatibility
- Provides a clean CLI interface
- Supports custom HTTP headers
- TypeScript type definitions included

## Prerequisites

- [Deno](https://deno.com/) 1.37.0 or higher

## Installation

No installation is needed! You can run the CLI directly using Deno:

```bash
# Run from GitHub (replace {VERSION} with the latest version or main)
deno run --allow-net --allow-env --allow-read https://raw.githubusercontent.com/yourusername/mcp-deno/{VERSION}/cli.ts <server-url> [callback-port]

# Or clone the repository and run locally
git clone https://github.com/yourusername/mcp-deno.git
cd mcp-deno
deno task start <server-url> [callback-port]
```

## Usage

```bash
# Basic usage with default callback port (3334)
deno task start https://your-mcp-server.com

# Specify a custom callback port
deno task start https://your-mcp-server.com 8080

# Include custom HTTP headers
deno task start https://your-mcp-server.com --header "Authorization: Bearer token" --header "X-Custom: Value"
```

## API

You can also use the library programmatically in your Deno projects:

```typescript
import { startProxy, runProxy } from "https://raw.githubusercontent.com/yourusername/mcp-deno/{VERSION}/mod.ts";

// Using the wrapped function
await startProxy("https://your-mcp-server.com", 3334, {
  "Authorization": "Bearer token"
});

// Or using the direct import from mcp-use
await runProxy("https://your-mcp-server.com", 3334, {
  "Authorization": "Bearer token"
});
```

## Development

```bash
# Run in development mode with auto-reload
deno task dev https://your-mcp-server.com

# Check types
deno check mod.ts cli.ts

# Format code
deno fmt
```

## How It Works

This project uses Deno's NPM compatibility feature to directly import and use the `mcp-use` package without the need for Node.js or a subprocess. It wraps the functionality in a Deno-friendly API with TypeScript type definitions.

## License

MIT - See the [LICENSE](LICENSE) file for details.

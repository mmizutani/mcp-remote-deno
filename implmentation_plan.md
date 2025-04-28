# Implmentation Plan

Here is a plan to transform your Node.js CLI package into a Deno CLI project, focusing on reusing the existing TypeScript code in the `src/` directory:

1. **Analyze Dependencies:**
    - [x] Identify Node.js built-in modules used (e.g., `events`, `process`).
    - [x] Identify external npm packages (e.g., `@modelcontextprotocol/sdk`).
2. **Configure `deno.json`:**
    - [x] Update the `imports` section to map npm packages using `npm:` specifiers (e.g., `"@modelcontextprotocol/sdk/": "npm:@modelcontextprotocol/sdk/"`).
    - [x] Ensure necessary Deno standard library modules are imported if needed (e.g., `std/node` for Node compatibility APIs if direct replacement isn't feasible).
    - [x] Update the `tasks` section to use `deno run` with appropriate permissions (`--allow-net`, `--allow-read`, `--allow-env`, etc.) targeting `src/proxy.ts`. Remove `--watch` from the main start task unless desired.
    - [x] Review `compilerOptions`. Deno uses these, but ensure they align with Deno's defaults or project needs. Remove `"types": ["node"]` as Deno handles Node types via `node:` specifiers.
    - [x] Remove `"unstable": ["sloppy-imports"]` and plan to add explicit file extensions to imports.
3. **Adapt Code in `src/`:**
    - [x] **Imports:**
        - [x] Prefix all Node.js built-in module imports with `node:` (e.g., `import { EventEmitter } from 'node:events';`).
        - [x] Update imports for external npm packages to match the `npm:` specifiers defined in `deno.json` or directly use `npm:` specifiers in the import statement.
        - [x] Append the `.ts` (or `.js` if applicable) extension to all relative file imports within the `src/` directory (e.g., `import { ... } from './lib/utils.ts';`).
    - [x] **Node Globals/APIs:**
        - [x] Replace `process.argv` with `Deno.args`. Note that `Deno.args` does *not* include the script name, so adjustments to slicing (like `.slice(2)`) might be needed or removed.
        - [x] Replace `process.exit()` with `Deno.exit()`.
        - [x] Replace or refactor any other Node-specific APIs that don't have direct Deno equivalents or aren't polyfilled via the `node:` specifier (e.g., check compatibility of `StdioServerTransport` if it relies heavily on Node streams internally, although the `npm:` specifier should handle much of this).
4. **Cleanup Project Root:**
    - [x] Delete `pnpm-lock.yaml` and `node_modules` (if present).
    - [x] Decide whether to keep `package.json`. It's not used by Deno for dependencies but can be useful for metadata (name, version, description). If kept, ensure it doesn't cause confusion.
    - [x] Remove `tsconfig.json` if all necessary compiler options are migrated to `deno.json`. Linters/editors might still pick it up, so consider keeping it for tooling compatibility if needed, but `deno.json` takes precedence for Deno itself.
5. **Testing:**
    - [x] Added client.ts as an additional CLI entrypoint
    - [x] Added client task to deno.json
    - [x] Run the main task using `deno task proxy:start <args...>`.
    - [x] Thoroughly test the CLI's functionality to ensure it behaves identically to the original Node.js version. Pay close attention to areas involving file system access, network requests, environment variables, and process management.

This plan prioritizes modifying the existing TypeScript code minimally while adapting the project structure and configuration for Deno. We will start by modifying `deno.json` and `src/proxy.ts`.

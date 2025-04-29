# Implementation Plan

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

6. **Refine Type Safety & Linting:**
    - [x] Address remaining `any` types and other linter warnings identified by `deno lint`.
    - [x] Improve type definitions, especially for external library interactions (e.g., express request/response types if kept).
    - [x] Run `deno fmt` to ensure consistent code formatting.
7. **Improve Dependency Management:**
    - [x] Evaluate replacing `npm:express` with a native Deno HTTP server solution (e.g., `Deno.serve` or from `std/http`).
    - [x] Evaluate replacing `npm:open` with a Deno equivalent or platform-specific commands.
8. **Implement Testing:**
    - [x] Add unit tests for key utility functions (e.g., in `utils.ts`, `mcp-auth-config.ts`).
    - [x] Add integration tests for the core proxy (`proxy.ts`) and client (`client.ts`) functionality.
9. **Enhance Documentation:**
    - [ ] Update `README.md` with Deno-specific installation, usage, and contribution guidelines.
    - [x] Add comprehensive TSDoc comments to all exported functions, classes, and interfaces.
10. **Build & Distribution:**
    - [ ] Configure `deno publish` settings if intending to publish to jsr.
    - [ ] Explore using `deno compile` to create standalone executables for different platforms.

This plan prioritizes modifying the existing TypeScript code minimally while adapting the project structure and configuration for Deno. We will start by modifying `deno.json` and `src/proxy.ts`.

# Secure Credential Storage Implementation Plan

## Current Architecture

The current implementation stores OAuth credentials as plain text JSON files in `~/.mcp-auth/` directory:

- `{server_hash}_client_info.json`: OAuth client registration information
- `{server_hash}_tokens.json`: OAuth tokens (access and refresh)
- `{server_hash}_code_verifier.txt`: PKCE code verifier
- `{server_hash}_lock.json`: Process lock information

This approach lacks security as sensitive credentials are stored unencrypted.

## Goals

1. Securely store OAuth credentials using platform-native secure storage:
   - macOS: iCloud Keychain
   - Linux: System keyring (via Secret Service API)
2. Maintain backward compatibility
3. Provide fallback mechanisms when secure storage is unavailable
4. Implement a clean abstraction layer for credential providers

## Proposed Architecture

### 1. Credential Storage Interface

Create an abstraction layer for credential storage operations:

```typescript
export interface CredentialStorage {
  /**
   * Store a credential value
   */
  store(key: string, value: string): Promise<void>;

  /**
   * Retrieve a credential value
   */
  retrieve(key: string): Promise<string | null>;

  /**
   * Check if a credential exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete a credential
   */
  delete(key: string): Promise<void>;
}
```

### 2. Platform-Specific Implementations

#### macOS: iCloud Keychain Implementation

Use the `keychain` module or native macOS APIs through FFI to interact with the Keychain:

```typescript
export class KeychainCredentialStorage implements CredentialStorage {
  private readonly service = "mcp-remote-deno";

  async store(key: string, value: string): Promise<void> {
    // Use keychain API to store securely
  }

  async retrieve(key: string): Promise<string | null> {
    // Use keychain API to retrieve
  }

  async exists(key: string): Promise<boolean> {
    // Check if key exists in keychain
  }

  async delete(key: string): Promise<void> {
    // Remove from keychain
  }
}
```

#### Linux: Secret Service Implementation

Use `libsecret` or similar library through Deno FFI to access the Secret Service API:

```typescript
export class SecretServiceCredentialStorage implements CredentialStorage {
  private readonly collection = "mcp-remote-deno";

  async store(key: string, value: string): Promise<void> {
    // Use Secret Service API to store
  }

  async retrieve(key: string): Promise<string | null> {
    // Use Secret Service API to retrieve
  }

  async exists(key: string): Promise<boolean> {
    // Check if key exists
  }

  async delete(key: string): Promise<void> {
    // Remove from Secret Service
  }
}
```

#### Fallback: Encrypted File Storage

For platforms without native secure storage or when permissions are restricted:

```typescript
export class EncryptedFileCredentialStorage implements CredentialStorage {
  private readonly encryptionKey: Uint8Array;
  private readonly baseDir: string;

  constructor(passphrase: string, baseDir?: string) {
    // Derive encryption key from passphrase
    // Set base directory
  }

  async store(key: string, value: string): Promise<void> {
    // Encrypt and store to file
  }

  async retrieve(key: string): Promise<string | null> {
    // Read from file and decrypt
  }

  async exists(key: string): Promise<boolean> {
    // Check if encrypted file exists
  }

  async delete(key: string): Promise<void> {
    // Delete encrypted file
  }
}
```

### 3. Factory Pattern for Provider Selection

Create a factory to determine the appropriate storage provider based on platform:

```typescript
export class CredentialStorageFactory {
  static async create(): Promise<CredentialStorage> {
    const platform = Deno.build.os;

    if (platform === "darwin") {
      try {
        const storage = new KeychainCredentialStorage();
        // Test if it works
        await storage.store("_test", "test");
        await storage.delete("_test");
        return storage;
      } catch (error) {
        console.warn("Keychain access failed, falling back to encrypted files");
      }
    }

    if (platform === "linux") {
      try {
        const storage = new SecretServiceCredentialStorage();
        // Test if it works
        await storage.store("_test", "test");
        await storage.delete("_test");
        return storage;
      } catch (error) {
        console.warn("Secret Service access failed, falling back to encrypted files");
      }
    }

    // Fallback for unsupported platforms or when secure storage fails
    return new EncryptedFileCredentialStorage(generateEncryptionKey());
  }
}
```

### 4. Integration with Existing Codebase

Update the `mcp-auth-config.ts` module to use the new credential storage system:

```typescript
// Initialize storage once
const credentialStorage = await CredentialStorageFactory.create();

export async function readJsonFile<T>(
  serverUrlHash: string,
  filename: string,
  schema: { parseAsync: (data: unknown) => Promise<T | null> | T | null },
): Promise<T | undefined> {
  const key = `${serverUrlHash}_${filename}`;

  const value = await credentialStorage.retrieve(key);
  if (value === null) {
    return undefined;
  }

  try {
    const result = await schema.parseAsync(JSON.parse(value));
    return result ?? undefined;
  } catch (error) {
    log(`Error parsing ${filename}:`, error);
    return undefined;
  }
}

export async function writeJsonFile(
  serverUrlHash: string,
  filename: string,
  data: unknown,
): Promise<void> {
  const key = `${serverUrlHash}_${filename}`;
  const value = JSON.stringify(data);

  await credentialStorage.store(key, value);
}

// Similar updates for readTextFile, writeTextFile, etc.
```

### 5. Migration Strategy

Create a migration utility to move existing credentials to the new secure storage:

```typescript
export async function migrateCredentials(): Promise<void> {
  const configDir = getConfigDir();

  try {
    // Check if old config directory exists
    const entries = await Deno.readDir(configDir);

    for await (const entry of entries) {
      if (!entry.isFile) continue;

      // Parse filename to get serverUrlHash and filename parts
      const match = entry.name.match(/^([^_]+)_(.+)$/);
      if (!match) continue;

      const [, serverUrlHash, filename] = match;
      const filePath = path.join(configDir, entry.name);

      // Read file content
      const content = await Deno.readTextFile(filePath);

      // Store in new secure storage
      const key = `${serverUrlHash}_${filename}`;
      await credentialStorage.store(key, content);

      // Optionally delete the original file
      // await Deno.remove(filePath);
    }

    log("Credentials successfully migrated to secure storage");
  } catch (error) {
    log("Error during credential migration:", error);
  }
}
```

## Implementation Phases

1. **Phase 1: Core Infrastructure**
   - Create the `CredentialStorage` interface
   - Implement the `EncryptedFileCredentialStorage` fallback
   - Create factory pattern for provider selection
   - Add unit tests for the core functionality

2. **Phase 2: macOS Implementation**
   - Implement `KeychainCredentialStorage` using Deno FFI
   - Add platform-specific tests for macOS
   - Integrate with factory pattern

3. **Phase 3: Linux Implementation**
   - Implement `SecretServiceCredentialStorage` using libsecret
   - Add platform-specific tests for Linux
   - Integrate with factory pattern

4. **Phase 4: Integration**
   - Update `mcp-auth-config.ts` to use the new storage system
   - Implement the migration utility
   - Update `NodeOAuthClientProvider` to use the new abstractions
   - Add integration tests

5. **Phase 5: Cleanup and Documentation**
   - Remove deprecated code paths
   - Update documentation and help text
   - Release with migration guide

## Technical Considerations

### Dependencies

- **macOS Keychain Access**: Use Deno FFI to call native keychain APIs or find a compatible library
- **Linux Secret Service**: Use `libsecret` through Deno FFI
- **Encryption**: Use Web Crypto API for the fallback encryption mechanism

### Permission Requirements

- **Keychain Access**: Requires user permission dialogs on macOS
- **Secret Service**: May require D-Bus permissions on Linux
- **File Access**: Still requires `--allow-write` and `--allow-read` for fallback storage

### Error Handling

- Implement robust error handling for all storage operations
- Provide clear error messages when secure storage is unavailable
- Always fall back to encrypted file storage when platform-specific methods fail

## Testing Strategy

1. **Unit Tests**:
   - Test each storage implementation independently
   - Mock platform-specific APIs for consistent testing

2. **Integration Tests**:
   - Test migration from old format to new secure storage
   - Verify OAuth flows work with the new storage system

3. **Platform Tests**:
   - Test on both macOS and Linux to verify platform-specific implementations

## Security Considerations

1. **Encryption at Rest**:
   - All credentials should be encrypted at rest
   - Use industry-standard encryption algorithms

2. **Access Control**:
   - Leverage OS-level access controls where available
   - Implement proper permission checks

3. **Key Management**:
   - For fallback encryption, derive keys securely
   - Consider allowing users to provide their own passphrase

## Compatibility and Rollback Plan

- Maintain backward compatibility by detecting and reading old storage format
- Implement a rollback mechanism to revert to file-based storage if needed
- Keep migration non-destructive initially to allow for safe testing

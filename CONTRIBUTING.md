# Contributing to Lumina AI Vault

[Leia este arquivo em Português (Brasil)](CONTRIBUINDO.md)

Thank you for your interest in contributing to Lumina AI Vault! This project follows strict architectural patterns to ensure reliability and maintainability.

## 🏗️ Architecture Overview

The project is built with a **modular handler-based architecture**:

- **`src/handlers/`**: Every tool provided to the MCP server must have its own class extending `BaseToolHandler`.
- **`src/vault.ts`**: Contains the core logic for file manipulation and vault management. This layer is fully asynchronous.
- **`src/server.ts`**: The entry point that orchestrates handlers and manages the MCP protocol connection.

## 🛠️ Development Workflow

### 1. Adding a New Tool

1. Create a new handler in `src/handlers/MyNewToolHandler.ts`.
2. Declare a module-level **Zod** schema constant for input validation.
3. Extend `BaseToolHandler` using `typeof YourSchema` as the generic parameter.
4. Implement the `execute` method.
5. Register the new handler in `src/handlers/index.ts`.

Example handler structure:

```typescript
import { z } from "zod";
import { BaseToolHandler } from "./base.js";

const MyNewToolInputSchema = z.object({
  target: z.string().min(1).describe("Target identifier"),
});

export class MyNewToolHandler extends BaseToolHandler<typeof MyNewToolInputSchema> {
  public readonly name = "my-new-tool";
  public readonly description = "One clear sentence describing what this tool does.";
  public readonly inputSchema = MyNewToolInputSchema;

  async execute(args: z.infer<typeof MyNewToolInputSchema>) {
    try {
      // implementation
      return { content: [{ type: "text", text: "..." }] };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}
```

> **Important:** always declare the schema as a `const` before the class and use `typeof SchemaConst` as the generic. Do not annotate the generic with `z.ZodObject<{...}>` — this breaks type inference with Zod v4.

### 2. Standards

- **TypeScript**: Use strict typing. Avoid `any` unless absolutely necessary (and explain why with a comment).
- **Asynchrony**: All I/O operations must be asynchronous using `fs/promises`.
- **Validation**: Use Zod v4 for all input schemas. Add `.describe()` to every field.
- **Linting**: Run `npm run lint` before committing.
- **Formatting**: We use Prettier. Use `npm run format` to keep the code consistent.

### 3. Testing

Every handler must have a corresponding test file in `src/__tests__/`. We use **Vitest** for testing.

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## 📝 Pull Request Process

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes with clear messages.
4. Push to the branch.
5. Open a Pull Request.

Make sure your PR passes all linting and unit tests!

---

Made with ❤️ and AI by [Kadu Velasco](https://github.com/kaduvelasco)

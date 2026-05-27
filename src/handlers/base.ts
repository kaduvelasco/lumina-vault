import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../logger.js";

/**
 * Base class for all MCP tool handlers.
 * Encapsulates validation logic, tool metadata, and execution.
 */
export abstract class BaseToolHandler<T extends z.ZodTypeAny> {
  public abstract readonly name: string;
  public abstract readonly description: string;
  public abstract readonly inputSchema: T;

  public validate(args: unknown): z.infer<T> {
    return this.inputSchema.parse(args);
  }

  public abstract execute(args: z.infer<T>): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;

  public getDefinition() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.getJsonSchema(),
    };
  }

  protected handleError(error: unknown): never {
    logger.error(`[${this.name}]`, error);
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : String(error)
    );
  }

  private getJsonSchema() {
    // Use Zod v4's native JSON Schema generation — no external dependency needed.
    const schema = z.toJSONSchema(this.inputSchema) as Record<string, unknown>;
    // Strip the $schema meta-field — MCP clients don't need it.
    delete schema["$schema"];
    return schema;
  }
}

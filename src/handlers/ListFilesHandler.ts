import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { listFiles, listFilesWithMetadata } from "../vault.js";
import { resolveContextAndRemember, contextNote } from "./resolveContext.js";
import { PATH_DESCRIPTION } from "./constants.js";

export class ListFilesHandler extends BaseToolHandler<
  z.ZodObject<{
    project: z.ZodOptional<z.ZodString>;
    subproject: z.ZodOptional<z.ZodString>;
    path: z.ZodOptional<z.ZodString>;
    workspace_root: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodBoolean>;
  }>
> {
  public readonly name = "list_files";
  public readonly description =
    "List all memory files (.md) inside a project or subproject. Use metadata=true to include file size, estimated tokens, and last modified date.";
  public readonly inputSchema = z.object({
    project: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Project name. If omitted, auto-discovered from workspace_root (.luminavault.json) or last used project."
      ),
    subproject: z
      .string()
      .min(1)
      .optional()
      .describe("Subproject name. When provided, lists files from vault/project/subproject/."),
    path: z.string().optional().describe(PATH_DESCRIPTION),
    workspace_root: z
      .string()
      .optional()
      .describe(
        "Project folder path. Used to auto-discover .luminavault.json when project is omitted."
      ),
    metadata: z
      .boolean()
      .optional()
      .describe(
        "When true, include size in bytes, estimated tokens, and last modified date for each file."
      ),
  });

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof this.inputSchema>) {
    try {
      const ctx = await resolveContextAndRemember(this.basePath, args);
      if (!ctx.ok) return ctx.response;

      const label = ctx.subproject ? `${ctx.project}/${ctx.subproject}` : ctx.project;

      if (args.metadata) {
        const files = await listFilesWithMetadata(ctx.basePath, ctx.project, ctx.subproject);
        const text =
          files.length > 0
            ? `Files in "${label}"${contextNote(ctx)}:\n${files
                .map(
                  (f) =>
                    `- ${f.name}  (${f.sizeBytes}B, ~${f.estimatedTokens} tokens, modified: ${f.lastModified})`
                )
                .join("\n")}`
            : `No files found in project "${label}".`;
        return { content: [{ type: "text", text }] };
      }

      const files = await listFiles(ctx.basePath, ctx.project, ctx.subproject);
      return {
        content: [
          {
            type: "text",
            text:
              files.length > 0
                ? `Files in "${label}"${contextNote(ctx)}:\n${files.map((f) => `- ${f}`).join("\n")}`
                : `No files found in project "${label}".`,
          },
        ],
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

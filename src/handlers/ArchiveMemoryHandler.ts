import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { archiveMemory, APPEND_ONLY_FILES } from "../vault.js";
import { resolveContextAndRemember, contextNote } from "./resolveContext.js";
import { PATH_DESCRIPTION } from "./constants.js";

export class ArchiveMemoryHandler extends BaseToolHandler<
  z.ZodObject<{
    project: z.ZodOptional<z.ZodString>;
    subproject: z.ZodOptional<z.ZodString>;
    filename: z.ZodEnum<["progress.md", "decisions.md"]>;
    keep_days: z.ZodDefault<z.ZodNumber>;
    path: z.ZodOptional<z.ZodString>;
    workspace_root: z.ZodOptional<z.ZodString>;
  }>
> {
  public readonly name = "archive_memory";
  public readonly description = `Move entries older than N days from an append-only file to a dated archive file, keeping the active file lean.

Only works on append-only files: ${APPEND_ONLY_FILES.join(", ")}.

Entries MUST follow the format:
  ## YYYY-MM-DD
  - entry line

Entries without a date header are always kept in the active file.
Archived entries are appended to a sibling file (e.g. progress-archive.md).
The archive file is never deleted — run search_memory or read_memory to access it.

Use this when progress.md or decisions.md grows large and slows down load_project_context.`;

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
      .describe("Subproject name. When provided, targets vault/project/subproject/."),
    filename: z
      .enum(["progress.md", "decisions.md"])
      .describe("File to archive. Must be an append-only file."),
    keep_days: z
      .number()
      .int()
      .min(1)
      .default(90)
      .describe("Number of recent days to keep in the active file (default: 90)."),
    path: z.string().optional().describe(PATH_DESCRIPTION),
    workspace_root: z
      .string()
      .optional()
      .describe(
        "Project folder path. Used to auto-discover .luminavault.json when project is omitted."
      ),
  });

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof this.inputSchema>) {
    try {
      const ctx = await resolveContextAndRemember(this.basePath, args);
      if (!ctx.ok) return ctx.response;

      const result = await archiveMemory(
        ctx.basePath,
        ctx.project,
        args.filename,
        args.keep_days,
        ctx.subproject
      );

      const label = ctx.subproject ? `${ctx.project}/${ctx.subproject}` : ctx.project;

      if (result.archivedCount === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Nothing to archive in ${label}/${args.filename}: all ${result.keptCount} entries are within the last ${args.keep_days} days.`,
            },
          ],
        };
      }

      const lines = [
        `Archived ${result.archivedCount} entr${result.archivedCount === 1 ? "y" : "ies"} from ${label}/${args.filename}${contextNote(ctx)}`,
        `  → ${result.archiveFile} (${result.archivedCount} archived)`,
        `  → ${args.filename} (${result.keptCount} kept${result.noDateCount > 0 ? `, ${result.noDateCount} undated` : ""})`,
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

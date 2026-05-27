import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { appendMemory, MEMORY_FILES } from "../vault.js";
import { resolveContextAndRemember, contextNote } from "./resolveContext.js";
import { PATH_DESCRIPTION } from "./constants.js";

const AppendMemoryInputSchema = z.object({
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
    .string()
    .min(1)
    .describe(`File to append to. Standard files: ${MEMORY_FILES.join(", ")}`),
  content: z.string().describe("Content to append"),
  path: z.string().optional().describe(PATH_DESCRIPTION),
  workspace_root: z
    .string()
    .optional()
    .describe(
      "Project folder path. Used to auto-discover .luminavault.json when project is omitted."
    ),
});

export class AppendMemoryHandler extends BaseToolHandler<typeof AppendMemoryInputSchema> {
  public readonly name = "append_memory";
  public readonly description =
    "Append content to a memory file without overwriting existing content.\n\n" +
    "IMPORTANT: When appending to progress.md or decisions.md, content MUST start with a date header:\n" +
    "  ## YYYY-MM-DD\n" +
    "  - entry line\n\n" +
    "This format is enforced and required for archive_memory to work correctly.";
  public readonly inputSchema = AppendMemoryInputSchema;

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof AppendMemoryInputSchema>) {
    try {
      const ctx = await resolveContextAndRemember(this.basePath, args);
      if (!ctx.ok) return ctx.response;

      const label = ctx.subproject ? `${ctx.project}/${ctx.subproject}` : ctx.project;
      await appendMemory(ctx.basePath, ctx.project, args.filename, args.content, ctx.subproject);
      return {
        content: [
          { type: "text", text: `Appended to: ${label}/${args.filename}${contextNote(ctx)}` },
        ],
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { writeMemory, MEMORY_FILES } from "../vault.js";
import { resolveContextAndRemember, contextNote } from "./resolveContext.js";
import { PATH_DESCRIPTION } from "./constants.js";

const WriteMemoryInputSchema = z.object({
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
    .describe(`File to write. Standard files: ${MEMORY_FILES.join(", ")}`),
  content: z.string().min(1).describe("New full content of the file (must not be empty)"),
  path: z.string().optional().describe(PATH_DESCRIPTION),
  workspace_root: z
    .string()
    .optional()
    .describe(
      "Project folder path. Used to auto-discover .luminavault.json when project is omitted."
    ),
});

export class WriteMemoryHandler extends BaseToolHandler<typeof WriteMemoryInputSchema> {
  public readonly name = "write_memory";
  public readonly description = "Overwrite the full content of a memory file";
  public readonly inputSchema = WriteMemoryInputSchema;

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof WriteMemoryInputSchema>) {
    try {
      const ctx = await resolveContextAndRemember(this.basePath, args);
      if (!ctx.ok) return ctx.response;

      const label = ctx.subproject ? `${ctx.project}/${ctx.subproject}` : ctx.project;
      await writeMemory(ctx.basePath, ctx.project, args.filename, args.content, ctx.subproject);
      return {
        content: [{ type: "text", text: `Written: ${label}/${args.filename}${contextNote(ctx)}` }],
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

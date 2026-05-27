import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { readMemory, MEMORY_FILES } from "../vault.js";
import { resolveContextAndRemember } from "./resolveContext.js";
import { PATH_DESCRIPTION } from "./constants.js";

const ReadMemoryInputSchema = z.object({
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
    .describe("Subproject name. When provided, reads from vault/project/subproject/."),
  filename: z
    .string()
    .min(1)
    .describe(`File to read. Standard files: ${MEMORY_FILES.join(", ")}`),
  path: z.string().optional().describe(PATH_DESCRIPTION),
  workspace_root: z
    .string()
    .optional()
    .describe(
      "Project folder path. Used to auto-discover .luminavault.json when project is omitted."
    ),
});

export class ReadMemoryHandler extends BaseToolHandler<typeof ReadMemoryInputSchema> {
  public readonly name = "read_memory";
  public readonly description = "Read a memory file from a project or subproject";
  public readonly inputSchema = ReadMemoryInputSchema;

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof ReadMemoryInputSchema>) {
    try {
      const ctx = await resolveContextAndRemember(this.basePath, args);
      if (!ctx.ok) return ctx.response;

      const content = await readMemory(ctx.basePath, ctx.project, args.filename, ctx.subproject);
      return {
        content: [{ type: "text", text: content.trim() || "(file is empty)" }],
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

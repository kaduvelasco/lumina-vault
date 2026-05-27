import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { loadProjectContext } from "../vault.js";
import { resolveContextAndRemember } from "./resolveContext.js";
import { PATH_DESCRIPTION } from "./constants.js";

const LoadProjectContextInputSchema = z.object({
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
    .describe("Subproject name. When provided, loads context from vault/project/subproject/."),
  path: z.string().optional().describe(PATH_DESCRIPTION),
  workspace_root: z
    .string()
    .optional()
    .describe(
      "Project folder path. Used to auto-discover .luminavault.json when project is omitted."
    ),
  files: z
    .array(z.string())
    .optional()
    .describe(
      'Optional list of specific filenames to load (e.g. ["memory.md", "stack.md"]). When omitted, all non-empty files are loaded.'
    ),
});

export class LoadProjectContextHandler extends BaseToolHandler<
  typeof LoadProjectContextInputSchema
> {
  public readonly name = "load_project_context";
  public readonly description =
    "Load memory files for a project or subproject concatenated into a single context block. Files that still contain only the blank template are omitted. Use the files parameter to load only specific files.";
  public readonly inputSchema = LoadProjectContextInputSchema;

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof LoadProjectContextInputSchema>) {
    try {
      const ctx = await resolveContextAndRemember(this.basePath, args);
      if (!ctx.ok) return ctx.response;

      const context = await loadProjectContext(
        ctx.basePath,
        ctx.project,
        args.files,
        ctx.subproject
      );
      return { content: [{ type: "text", text: context }] };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

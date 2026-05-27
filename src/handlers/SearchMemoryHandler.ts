import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { searchMemory, resolveBasePath } from "../vault.js";
import { resolveContext } from "./resolveContext.js";
import { updateLastProject } from "../config.js";
import { PATH_DESCRIPTION } from "./constants.js";

const SearchMemoryInputSchema = z.object({
  query: z.string().min(1).describe("Text to search for (case-insensitive, cannot be empty)"),
  project: z
    .string()
    .optional()
    .describe(
      "Limit search to a specific project. If omitted without workspace_root, searches all projects."
    ),
  subproject: z
    .string()
    .optional()
    .describe("Limit search to a specific subproject (requires project)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(100)
    .describe("Maximum number of results to return (default: 100, max: 1000)"),
  context_lines: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Number of context lines to show around each match (default: 0)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Number of results to skip for pagination (default: 0)"),
  path: z.string().optional().describe(PATH_DESCRIPTION),
  workspace_root: z
    .string()
    .optional()
    .describe(
      "Project folder path. When provided, auto-discovers .luminavault.json to restrict search to that project/subproject."
    ),
});

export class SearchMemoryHandler extends BaseToolHandler<typeof SearchMemoryInputSchema> {
  public readonly name = "search_memory";
  public readonly description = `Search for a text string across memory files in the vault.

Scope:
- No project/subproject specified → searches all projects and their subprojects
- project only → searches the project root files and all its subprojects
- project + subproject → searches only that specific subproject

Results are returned as: project[/subproject]/file:lineNumber  matched text`;

  public readonly inputSchema = SearchMemoryInputSchema;

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof SearchMemoryInputSchema>) {
    try {
      let basePath = this.basePath;
      let project: string | undefined = args.project;
      let subproject: string | undefined = args.subproject;

      // Auto-discover project/subproject from workspace_root only
      if (!project && args.workspace_root) {
        const ctx = await resolveContext(this.basePath, {
          workspace_root: args.workspace_root,
          path: args.path,
        });
        if (ctx.ok) {
          project = ctx.project;
          subproject = ctx.subproject;
          basePath = ctx.basePath;
        }
      } else if (args.path) {
        basePath = resolveBasePath(args.path);
      }

      if (project) {
        await updateLastProject(project, subproject).catch(() => {});
      }

      const { results, truncated } = await searchMemory(
        basePath,
        args.query,
        project,
        args.limit,
        args.context_lines,
        args.offset,
        subproject
      );

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No results for "${args.query}"` }],
        };
      }

      const lines = results.map((r) => {
        const scope = r.subproject ? `${r.project}/${r.subproject}` : r.project;
        let output = `${scope}/${r.file}:${r.line}  ${r.text}`;
        if (r.context && r.context.length > 0) {
          output += `\nContext:\n${r.context.map((line) => `  ${line}`).join("\n")}\n---`;
        }
        return output;
      });

      if (truncated) lines.push(`(limit of ${args.limit} results reached, use offset to paginate)`);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

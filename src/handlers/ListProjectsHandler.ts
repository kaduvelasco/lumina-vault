import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { listProjects, listSubProjects, resolveBasePath } from "../vault.js";
import { PATH_DESCRIPTION } from "./constants.js";

const ListProjectsInputSchema = z.object({
  path: z.string().optional().describe(PATH_DESCRIPTION),
});

export class ListProjectsHandler extends BaseToolHandler<typeof ListProjectsInputSchema> {
  public readonly name = "list_projects";
  public readonly description =
    "List all projects in the vault. Each project is shown with its subprojects indented below it.";
  public readonly inputSchema = ListProjectsInputSchema;

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof ListProjectsInputSchema>) {
    try {
      const resolvedPath = args.path ? resolveBasePath(args.path) : this.basePath;
      const projects = await listProjects(resolvedPath);

      if (projects.length === 0) {
        return {
          content: [{ type: "text", text: "No projects found. Use create_project to add one." }],
        };
      }

      const lines: string[] = [];
      for (const project of projects) {
        const subs = await listSubProjects(resolvedPath, project);
        lines.push(`- ${project}`);
        for (const sub of subs) {
          lines.push(`  └─ ${sub}`);
        }
      }

      return {
        content: [{ type: "text", text: `Projects in vault:\n${lines.join("\n")}` }],
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

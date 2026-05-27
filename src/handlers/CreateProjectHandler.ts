import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { createProject, MEMORY_FILES, resolveBasePath } from "../vault.js";
import { PATH_DESCRIPTION } from "./constants.js";

const CreateProjectInputSchema = z.object({
  project: z.string().min(1).describe("Parent project name (alphanumeric, hyphens, underscores)"),
  subproject: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Subproject name. When provided, creates vault/project/subproject/ instead of vault/project/."
    ),
  path: z.string().optional().describe(PATH_DESCRIPTION),
});

export class CreateProjectHandler extends BaseToolHandler<typeof CreateProjectInputSchema> {
  public readonly name = "create_project";
  public readonly description = `Create a new project (or subproject) in the vault with standard memory files: ${MEMORY_FILES.join(", ")}.

If "subproject" is provided, the vault is created inside the parent project folder: vault/project/subproject/.
If the parent project does not exist yet, it is created automatically.`;
  public readonly inputSchema = CreateProjectInputSchema;

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof CreateProjectInputSchema>) {
    try {
      const projectName = args.project.trim();
      const subprojectName = args.subproject?.trim();
      const resolvedPath = args.path ? resolveBasePath(args.path) : this.basePath;
      const { dir, created } = await createProject(resolvedPath, projectName, subprojectName);
      const label = subprojectName ? `${projectName}/${subprojectName}` : projectName;
      return {
        content: [
          {
            type: "text",
            text: created
              ? `Project "${label}" created at: ${dir}`
              : `Project "${label}" already exists at: ${dir}`,
          },
        ],
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { readGlobalConfig } from "../config.js";
import { readLocalConfig, listSubProjects, resolveBasePath } from "../vault.js";
import { PATH_DESCRIPTION } from "./constants.js";

const GetVaultConfigInputSchema = z.object({
  workspace_root: z
    .string()
    .optional()
    .describe(
      "Project folder path. When provided, the tool reads .luminavault.json (walking up the directory tree) and lists auto-detected subprojects."
    ),
  path: z.string().optional().describe(PATH_DESCRIPTION),
});

export class GetVaultConfigHandler extends BaseToolHandler<typeof GetVaultConfigInputSchema> {
  public readonly name = "get_vault_config";
  public readonly description =
    "Returns the current vault configuration: active vault path, global vault settings, last used project, and — when workspace_root is provided — the local project/subproject config and auto-detected subprojects. Call this before init_project_memory when the user has not specified a vault path.";

  public readonly inputSchema = GetVaultConfigInputSchema;

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof GetVaultConfigInputSchema>) {
    try {
      const config = await readGlobalConfig();
      const resolvedPath = args.path ? resolveBasePath(args.path) : this.basePath;

      const report: Record<string, unknown> = {
        active_vault: resolvedPath,
        global_vault_configured: !!config.globalVaultPath,
        global_vault_path: config.globalVaultPath ?? null,
        last_project: config.lastProject ?? null,
        last_subproject: config.lastSubproject ?? null,
      };

      if (args.workspace_root) {
        const local = await readLocalConfig(args.workspace_root);
        if (local) {
          const subprojects = await listSubProjects(resolvedPath, local.project);
          report.local_config = {
            config_root: local.configRoot,
            project: local.project,
            subproject: local.subproject ?? null,
            path: local.path ?? null,
            subprojects,
          };
        } else {
          report.local_config = null;
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { checkProjectHealth } from "../vault.js";
import { resolveContextAndRemember, contextNote } from "./resolveContext.js";
import { PATH_DESCRIPTION } from "./constants.js";

const HealthCheckInputSchema = z.object({
  project: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Project name to check. If omitted, auto-discovered from workspace_root (.luminavault.json) or last used project."
    ),
  subproject: z
    .string()
    .min(1)
    .optional()
    .describe("Subproject name. When provided, checks vault/project/subproject/."),
  path: z.string().optional().describe(PATH_DESCRIPTION),
  workspace_root: z
    .string()
    .optional()
    .describe(
      "Project folder path. Used to auto-discover .luminavault.json when project is omitted."
    ),
});

export class HealthCheckHandler extends BaseToolHandler<typeof HealthCheckInputSchema> {
  public readonly name = "check_project_health";
  public readonly description =
    "Verify if all required memory files exist for a project or subproject and report its health status.";
  public readonly inputSchema = HealthCheckInputSchema;

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof HealthCheckInputSchema>) {
    try {
      const ctx = await resolveContextAndRemember(this.basePath, args);
      if (!ctx.ok) return ctx.response;

      const health = await checkProjectHealth(ctx.basePath, ctx.project, ctx.subproject);
      const label = health.subproject ? `${health.project}/${health.subproject}` : health.project;

      let report = `Health report for project: ${label}${contextNote(ctx)}\n`;
      report += `Status: ${health.isHealthy ? "HEALTHY ✅" : "UNHEALTHY ❌"}\n\n`;
      report += "Files:\n";

      for (const [file, status] of Object.entries(health.files)) {
        report += `- ${file}: ${status === "ok" ? "OK" : "MISSING"}\n`;
      }

      if (!health.isHealthy) {
        report +=
          "\nRecommendation: Use create_project or init_project_memory to restore missing files.";
      }

      return {
        content: [{ type: "text", text: report }],
        isError: !health.isHealthy,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

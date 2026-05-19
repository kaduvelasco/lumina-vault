import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { deleteProject, promoteSubProject, listSubProjects, resolveBasePath } from "../vault.js";
import { PATH_DESCRIPTION } from "./constants.js";

export class DeleteProjectHandler extends BaseToolHandler<
  z.ZodObject<{
    project: z.ZodString;
    subproject: z.ZodOptional<z.ZodString>;
    confirm: z.ZodBoolean;
    subproject_action: z.ZodOptional<z.ZodEnum<["cancel", "promote", "delete_all"]>>;
    path: z.ZodOptional<z.ZodString>;
  }>
> {
  public readonly name = "delete_project";
  public readonly description = `Permanently delete a project or subproject. This action is irreversible. Always ask the user explicitly before calling this tool.

DELETING A SUBPROJECT:
  Provide both "project" and "subproject". Requires confirm: true.
  Only the subproject vault is removed; the parent project is untouched.

DELETING A PROJECT:
  Provide only "project". Requires confirm: true.
  If the project has subprojects, you MUST also provide "subproject_action":
    - "cancel"     — abort the deletion (do nothing)
    - "promote"    — move each subproject to the vault root as an independent project, then delete the (now empty) parent
    - "delete_all" — delete the project and all its subprojects

  If subproject_action is omitted and the project has subprojects, the tool will list them
  and return a warning asking which action to take — call the tool again with the chosen action.`;

  public readonly inputSchema = z.object({
    project: z.string().min(1).describe("Project name to delete"),
    subproject: z
      .string()
      .min(1)
      .optional()
      .describe("Subproject name. When provided, deletes only this subproject."),
    confirm: z.boolean().describe("Must be true to confirm permanent deletion"),
    subproject_action: z
      .enum(["cancel", "promote", "delete_all"])
      .optional()
      .describe(
        'Required when deleting a project that has subprojects: "cancel", "promote", or "delete_all"'
      ),
    path: z.string().optional().describe(PATH_DESCRIPTION),
  });

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof this.inputSchema>) {
    const projectName = args.project.trim();
    const subprojectName = args.subproject?.trim();

    if (args.confirm !== true) {
      return {
        content: [
          {
            type: "text",
            text: "Error: pass confirm: true to confirm permanent deletion. Ask the user before proceeding.",
          },
        ],
        isError: true,
      };
    }

    try {
      const resolvedPath = args.path ? resolveBasePath(args.path) : this.basePath;

      // Deleting a specific subproject
      if (subprojectName) {
        await deleteProject(resolvedPath, projectName, subprojectName);
        return {
          content: [
            { type: "text", text: `Subproject "${projectName}/${subprojectName}" deleted.` },
          ],
        };
      }

      // Deleting a project — check for subprojects first
      const subs = await listSubProjects(resolvedPath, projectName);

      if (subs.length > 0 && !args.subproject_action) {
        const list = subs.map((s) => `  - ${s}`).join("\n");
        return {
          content: [
            {
              type: "text",
              text:
                `Project "${projectName}" has ${subs.length} subproject(s):\n${list}\n\n` +
                `Call delete_project again with "subproject_action" set to one of:\n` +
                `  - "cancel"     — abort, do nothing\n` +
                `  - "promote"    — move each subproject to the vault root as an independent project\n` +
                `  - "delete_all" — delete the project and all its subprojects`,
            },
          ],
        };
      }

      if (args.subproject_action === "cancel") {
        return {
          content: [{ type: "text", text: `Deletion of "${projectName}" cancelled.` }],
        };
      }

      if (args.subproject_action === "promote" && subs.length > 0) {
        const promoted: string[] = [];
        const errors: string[] = [];
        for (const sub of subs) {
          try {
            await promoteSubProject(resolvedPath, projectName, sub);
            promoted.push(sub);
          } catch (err) {
            errors.push(`${sub}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        if (errors.length > 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  `Could not promote all subprojects. Errors:\n${errors.join("\n")}\n\n` +
                  `Promoted: ${promoted.join(", ") || "none"}. Deletion aborted.`,
              },
            ],
            isError: true,
          };
        }
        // After promoting all subs, the project dir may still contain the root memory files — delete it
        await deleteProject(resolvedPath, projectName);
        return {
          content: [
            {
              type: "text",
              text: `Project "${projectName}" deleted. Subprojects promoted to vault root: ${promoted.join(", ")}.`,
            },
          ],
        };
      }

      // delete_all or no subprojects
      await deleteProject(resolvedPath, projectName);
      const note = subs.length > 0 ? ` (including subprojects: ${subs.join(", ")})` : "";
      return {
        content: [{ type: "text", text: `Project "${projectName}" deleted${note}.` }],
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

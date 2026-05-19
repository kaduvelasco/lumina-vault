import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { initProjectMemory, InitAnswers, resolveBasePath, readLocalConfig } from "../vault.js";
import { readGlobalConfig, updateLastProject } from "../config.js";
import { analyzeProject } from "../analyzers/projectAnalyzer.js";
import { PATH_DESCRIPTION } from "./constants.js";
import { logger } from "../logger.js";

const NEEDS_PROJECT_MESSAGE = `Could not determine the project name automatically.

Please provide one of the following:
- "workspace_root": path to your project folder — the tool will read .luminavault.json if present, or create one after initialization
- "project": explicit project name to initialize

If this is a brand-new project with no .luminavault.json yet, provide both "project" and "workspace_root" so the tool can create the config file for you.`;

export class InitProjectMemoryHandler extends BaseToolHandler<
  z.ZodObject<{
    project: z.ZodOptional<z.ZodString>;
    subproject: z.ZodOptional<z.ZodString>;
    path: z.ZodOptional<z.ZodString>;
    workspace_root: z.ZodOptional<z.ZodString>;
    auto_detect: z.ZodOptional<z.ZodBoolean>;
    description: z.ZodOptional<z.ZodString>;
    goal: z.ZodOptional<z.ZodString>;
    phase: z.ZodOptional<z.ZodString>;
    architecture_overview: z.ZodOptional<z.ZodString>;
    components: z.ZodOptional<z.ZodString>;
    languages: z.ZodOptional<z.ZodString>;
    frameworks: z.ZodOptional<z.ZodString>;
    infrastructure: z.ZodOptional<z.ZodString>;
    next_steps: z.ZodOptional<z.ZodString>;
  }>
> {
  public readonly name = "init_project_memory";
  public readonly description = `Initialize memory files for a project or subproject with structured content.

STEP 1 — VAULT SELECTION
If the user has not explicitly specified a vault path, call get_vault_config first.
If global_vault_configured is true, ask:
  "A global vault is configured at <global_vault_path>. Do you want to use it? (yes/no)"
  - Yes → pass that path as "path". No → leave "path" empty.

STEP 2 — PROJECT OR SUBPROJECT?
IMPORTANT: Before calling this tool, determine whether the target is a top-level project or a subproject.

Clues that it IS a subproject: words like "plugin", "module", "package", "extension", "component", "library", "service" in the user's request.
When uncertain: ASK the user — "Is this a subproject of an existing project? If yes, which project?"

If it is a subproject, set both "project" (the parent) and "subproject" (the component name).
The vault will be created at vault/project/subproject/.

If workspace_root is provided:
  - The tool reads .luminavault.json walking up the directory tree.
  - If found with "subproject" field: re-initializes that subproject.
  - If found with only "project": re-initializes the root project.
  - If not found: creates a new .luminavault.json at workspace_root.

STEP 3 — PROJECT DATA
Ask the user: "How do you want to define the project data?
  1. Auto-analyze (recommended — I will read the project files)
  2. Enter manually"

If option 1: set auto_detect: true with workspace_root.
If option 2: ask these questions (skip any the user can't answer yet):
  1. What does the project do? (description)
  2. What is the main goal?
  3. What is the current phase? (planning / mvp / active / maintenance)
  4. Describe the architecture briefly.
  5. What are the main components? (comma-separated)
  6. What languages are used?
  7. What frameworks and libraries are used?
  8. What infrastructure is used?
  9. What are the immediate next tasks?

Only files that are empty or contain the blank template will be written.`;

  public readonly inputSchema = z.object({
    project: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Parent project name. If omitted, auto-discovered from workspace_root (.luminavault.json)."
      ),
    subproject: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Subproject name (plugin, module, package, etc.). When provided, vault is created at vault/project/subproject/."
      ),
    path: z.string().optional().describe(PATH_DESCRIPTION),
    workspace_root: z
      .string()
      .optional()
      .describe(
        "Local root directory of the project or subproject. Used to auto-discover .luminavault.json and to create one after initialization."
      ),
    auto_detect: z
      .boolean()
      .optional()
      .describe(
        "When true, analyzes the project files at workspace_root and infers description, languages, frameworks, and infrastructure automatically."
      ),
    description: z.string().optional().describe("What the project does"),
    goal: z.string().optional().describe("Main goal or objective"),
    phase: z.string().optional().describe("Current phase: planning / mvp / active / maintenance"),
    architecture_overview: z.string().optional().describe("Brief architecture description"),
    components: z.string().optional().describe("Main components, comma-separated"),
    languages: z.string().optional().describe("Programming languages"),
    frameworks: z.string().optional().describe("Frameworks and libraries"),
    infrastructure: z.string().optional().describe("Infrastructure and hosting"),
    next_steps: z.string().optional().describe("Immediate next tasks, comma or newline separated"),
  });

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof this.inputSchema>) {
    if (args.auto_detect && !args.workspace_root) {
      return {
        content: [
          { type: "text", text: "Error: workspace_root is required when auto_detect is true." },
        ],
        isError: true,
      };
    }

    try {
      // Resolve project name, subproject, and vault path
      let projectName = args.project?.trim();
      let subprojectName = args.subproject?.trim();
      let resolvedPath = args.path ? resolveBasePath(args.path) : this.basePath;

      const localConfig = args.workspace_root ? await readLocalConfig(args.workspace_root) : null;

      if (localConfig) {
        if (!projectName) projectName = localConfig.project;
        if (!subprojectName && localConfig.subproject) subprojectName = localConfig.subproject;
        if (localConfig.path && !args.path) resolvedPath = resolveBasePath(localConfig.path);
      }

      if (!projectName) {
        const globalCfg = await readGlobalConfig();
        if (globalCfg.lastProject) {
          projectName = globalCfg.lastProject;
          if (!subprojectName && globalCfg.lastSubproject)
            subprojectName = globalCfg.lastSubproject;
          if (globalCfg.globalVaultPath && !args.path) {
            resolvedPath = resolveBasePath(globalCfg.globalVaultPath);
          }
          logger.info(`init_project_memory: using last known project "${projectName}"`);
        }
      }

      if (!projectName) {
        return { content: [{ type: "text", text: NEEDS_PROJECT_MESSAGE }] };
      }

      // Auto-detect project data
      let detected: InitAnswers = {};
      if (args.auto_detect && args.workspace_root) {
        detected = await analyzeProject(args.workspace_root);
      }

      const answers: InitAnswers = {
        description: args.description ?? detected.description,
        goal: args.goal ?? detected.goal,
        phase: args.phase ?? detected.phase,
        architectureOverview: args.architecture_overview ?? detected.architectureOverview,
        components: args.components ?? detected.components,
        languages: args.languages ?? detected.languages,
        frameworks: args.frameworks ?? detected.frameworks,
        infrastructure: args.infrastructure ?? detected.infrastructure,
        nextSteps: args.next_steps ?? detected.nextSteps,
      };

      const message = await initProjectMemory(
        resolvedPath,
        projectName,
        answers,
        args.workspace_root,
        args.path ? resolvedPath : undefined,
        subprojectName
      );

      await updateLastProject(projectName, subprojectName).catch((err) =>
        logger.error("Failed to update lastProject", err)
      );

      const autoDetectNote =
        args.auto_detect && Object.keys(detected).length > 0
          ? "\n\nAuto-detected fields: " +
            Object.entries(detected)
              .filter(([, v]) => v !== undefined)
              .map(([k]) => k)
              .join(", ")
          : "";

      return { content: [{ type: "text", text: message + autoDetectNote }] };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

import { resolveBasePath, readLocalConfig } from "../vault.js";
import { readGlobalConfig, updateLastProject } from "../config.js";
import { logger } from "../logger.js";

export interface ResolvedContext {
  ok: true;
  project: string;
  subproject?: string;
  basePath: string;
  source: "provided" | "local_config" | "global_config";
}

export interface UnresolvedContext {
  ok: false;
  response: { content: Array<{ type: string; text: string }> };
}

const NEEDS_INPUT_MESSAGE = `Could not determine the active project or vault path automatically.

Please provide one of the following:
- "workspace_root": path to your project folder — the tool will read .luminavault.json if present
- "project": explicit project name (optionally with "path" for a custom vault location)

Tip: run init_project_memory with workspace_root to create .luminavault.json and enable automatic discovery in future sessions.`;

export function contextNote(ctx: ResolvedContext): string {
  const label = ctx.subproject ? `${ctx.project}/${ctx.subproject}` : ctx.project;
  if (ctx.source === "local_config") return ` [project: ${label}, from .luminavault.json]`;
  if (ctx.source === "global_config") return ` [project: ${label}, from last session]`;
  return "";
}

function makeContext(
  project: string,
  subproject: string | undefined,
  basePath: string,
  source: ResolvedContext["source"]
): ResolvedContext {
  const ctx: ResolvedContext = { ok: true, project, basePath, source };
  if (subproject !== undefined) ctx.subproject = subproject;
  return ctx;
}

export async function resolveContext(
  serverBasePath: string,
  args: {
    project?: string | undefined;
    subproject?: string | undefined;
    path?: string | undefined;
    workspace_root?: string | undefined;
  }
): Promise<ResolvedContext | UnresolvedContext> {
  // Explicit project takes priority
  const projectName = args.project?.trim();
  const subprojectName = args.subproject?.trim() || undefined;
  if (projectName) {
    const basePath = args.path ? resolveBasePath(args.path) : serverBasePath;
    return makeContext(projectName, subprojectName, basePath, "provided");
  }

  // Step 1: .luminavault.json in workspace_root
  if (args.workspace_root) {
    const local = await readLocalConfig(args.workspace_root);
    if (local) {
      const basePath = local.path ? resolveBasePath(local.path) : serverBasePath;
      const label = local.subproject ? `${local.project}/${local.subproject}` : local.project;
      logger.info(`Auto-discovered project "${label}" from .luminavault.json`);
      return makeContext(local.project, local.subproject, basePath, "local_config");
    }
  }

  // Step 2: global config (lastProject + globalVaultPath)
  const globalCfg = await readGlobalConfig();
  if (globalCfg.lastProject) {
    const basePath = globalCfg.globalVaultPath
      ? resolveBasePath(globalCfg.globalVaultPath)
      : serverBasePath;
    const label = globalCfg.lastSubproject
      ? `${globalCfg.lastProject}/${globalCfg.lastSubproject}`
      : globalCfg.lastProject;
    logger.info(`Using last known project "${label}" from global config`);
    return makeContext(globalCfg.lastProject, globalCfg.lastSubproject, basePath, "global_config");
  }

  // Step 3: needs user input
  return {
    ok: false,
    response: { content: [{ type: "text", text: NEEDS_INPUT_MESSAGE }] },
  };
}

export async function resolveContextAndRemember(
  serverBasePath: string,
  args: {
    project?: string | undefined;
    subproject?: string | undefined;
    path?: string | undefined;
    workspace_root?: string | undefined;
  }
): Promise<ResolvedContext | UnresolvedContext> {
  const result = await resolveContext(serverBasePath, args);
  if (result.ok) {
    await updateLastProject(result.project, result.subproject).catch((err) =>
      logger.error("Failed to update lastProject", err)
    );
  }
  return result;
}

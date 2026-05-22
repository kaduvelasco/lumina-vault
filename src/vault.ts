import { existsSync } from "fs";
import { readdir, readFile, mkdir, appendFile, unlink, stat, rm, rename } from "fs/promises";
import { join, resolve, dirname } from "path";
import { atomicWrite } from "./utils/atomicWrite.js";
import { homedir } from "os";
import { logger } from "./logger.js";

export const DEFAULT_BASE_PATH = join(homedir(), ".lumina-vault", "knowledge");

export const MEMORY_FILES = [
  "memory.md",
  "architecture.md",
  "stack.md",
  "decisions.md",
  "progress.md",
  "next_steps.md",
] as const;

export const APPEND_ONLY_FILES: readonly string[] = ["progress.md", "decisions.md"];

const DATE_HEADER_RE = /^##\s+(\d{4}-\d{2}-\d{2})\b/m;
const SECTION_SPLIT_RE = /(?=^##\s+\d{4}-\d{2}-\d{2}\b)/m;

export type MemoryFile = (typeof MEMORY_FILES)[number];

export const MEMORY_TEMPLATES: Record<MemoryFile, string> = {
  "memory.md": `# Memory

## Overview
- **Name:**
- **Description:**
- **Goal:**

## Current Status
- **Phase:**
- **Last updated:**

## Key Components
-

## Important Notes
-
`,

  "architecture.md": `# Architecture

## Overview

## Components

## Data Flow

## External Integrations
-
`,

  "stack.md": `# Stack

## Languages
-

## Frameworks
-

## Libraries
-

## Infrastructure
-

## Dev Tools
-
`,

  "decisions.md": `# Decisions
`,

  "progress.md": `# Progress
`,

  "next_steps.md": `# Next Steps

## Now
-

## Soon
-

## Later
-

## Ideas
-
`,
};

const MEMORY_TEMPLATES_TRIMMED: Record<MemoryFile, string> = Object.fromEntries(
  MEMORY_FILES.map((f) => [f, MEMORY_TEMPLATES[f].trim()])
) as Record<MemoryFile, string>;

export interface LocalVaultConfig {
  project: string;
  subproject?: string;
  path?: string;
}

export interface ResolvedLocalConfig {
  project: string;
  subproject?: string;
  path?: string;
  configRoot: string;
}

/**
 * Walks up from workspaceRoot to find .luminavault.json.
 * Returns the resolved config or null if not found.
 */
export async function readLocalConfig(workspaceRoot: string): Promise<ResolvedLocalConfig | null> {
  let dir = resolve(workspaceRoot);

  while (true) {
    const configPath = join(dir, ".luminavault.json");
    if (existsSync(configPath)) {
      try {
        const raw = await readFile(configPath, "utf-8");
        const parsed = JSON.parse(raw) as LocalVaultConfig;

        if (typeof parsed.project !== "string" || !parsed.project.trim()) {
          logger.error(
            `Invalid .luminavault.json at ${configPath}: missing or empty "project" field`
          );
          return null;
        }

        const result: ResolvedLocalConfig = {
          project: parsed.project.trim(),
          configRoot: dir,
        };
        if (parsed.subproject?.trim()) result.subproject = parsed.subproject.trim();
        if (parsed.path) result.path = parsed.path;
        return result;
      } catch (err) {
        logger.error(`Failed to read .luminavault.json at ${configPath}`, err);
        return null;
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

export function resolveBasePath(envPath?: string): string {
  let raw = envPath?.trim() || process.env.LUMINAVAULT_BASE_PATH?.trim() || DEFAULT_BASE_PATH;
  raw = raw.replace(/^(?:HOME|\$HOME|~)(?=[\\/]|$)/i, homedir());
  return resolve(raw);
}

export function projectPath(basePath: string, project: string, subproject?: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(project)) {
    throw new Error(
      `Invalid project name: "${project}". Use only letters, numbers, hyphens, and underscores.`
    );
  }
  if (subproject !== undefined) {
    if (!/^[a-zA-Z0-9_-]+$/.test(subproject)) {
      throw new Error(
        `Invalid subproject name: "${subproject}". Use only letters, numbers, hyphens, and underscores.`
      );
    }
    return join(basePath, project, subproject);
  }
  return join(basePath, project);
}

function validateFilename(filename: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.md$/.test(filename)) {
    throw new Error(
      `Invalid filename: "${filename}". Must be a .md file starting with a letter or digit.`
    );
  }
  return filename;
}

async function getLastChar(filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf-8");
  return content.at(-1) ?? "";
}

function toList(value: string | undefined): string {
  if (!value?.trim()) return "-";
  return value
    .split(/[,\n;]+/)
    .map((s) => s.trim().replace(/^-\s+/, ""))
    .filter(Boolean)
    .map((s) => `- ${s}`)
    .join("\n");
}

/**
 * Returns true if the directory contains at least one standard memory file,
 * which identifies it as a project or subproject vault.
 */
function hasMemoryFiles(dir: string): boolean {
  return MEMORY_FILES.some((f) => existsSync(join(dir, f)));
}

export async function listProjects(basePath: string): Promise<string[]> {
  if (!existsSync(basePath)) return [];
  try {
    const entries = await readdir(basePath, { withFileTypes: true });
    return entries
      .filter((d) => d.isDirectory() && hasMemoryFiles(join(basePath, d.name)))
      .map((d) => d.name)
      .sort();
  } catch (err) {
    logger.error(`Failed to list projects in ${basePath}`, err);
    return [];
  }
}

/**
 * Lists subprojects of a project by scanning for subdirectories
 * that contain at least one standard memory file.
 */
export async function listSubProjects(basePath: string, project: string): Promise<string[]> {
  const projectDir = join(basePath, project);
  if (!existsSync(projectDir)) return [];
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    const subs: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (hasMemoryFiles(join(projectDir, entry.name))) {
        subs.push(entry.name);
      }
    }
    return subs.sort();
  } catch (err) {
    logger.error(`Failed to list subprojects for "${project}"`, err);
    return [];
  }
}

export async function listFiles(
  basePath: string,
  project: string,
  subproject?: string
): Promise<string[]> {
  const dir = projectPath(basePath, project, subproject);
  if (!existsSync(dir))
    throw new Error(`Project not found: "${subproject ? `${project}/${subproject}` : project}"`);
  const files = await readdir(dir);
  return files.filter((f) => f.endsWith(".md")).sort();
}

export interface FileMetadata {
  name: string;
  sizeBytes: number;
  estimatedTokens: number;
  lastModified: string;
}

export async function listFilesWithMetadata(
  basePath: string,
  project: string,
  subproject?: string
): Promise<FileMetadata[]> {
  const dir = projectPath(basePath, project, subproject);
  if (!existsSync(dir))
    throw new Error(`Project not found: "${subproject ? `${project}/${subproject}` : project}"`);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  return Promise.all(
    files.map(async (name) => {
      const { size, mtimeMs } = await stat(join(dir, name));
      return {
        name,
        sizeBytes: size,
        estimatedTokens: Math.round(size / 4),
        lastModified: new Date(mtimeMs).toISOString().slice(0, 10),
      };
    })
  );
}

export async function createProject(
  basePath: string,
  project: string,
  subproject?: string
): Promise<{ dir: string; created: boolean }> {
  // Ensure the parent project directory exists when creating a subproject
  if (subproject !== undefined) {
    const parentDir = join(basePath, project);
    if (!existsSync(parentDir)) {
      await mkdir(parentDir, { recursive: true });
      await Promise.all(
        MEMORY_FILES.map((file) => {
          const filePath = join(parentDir, file);
          return existsSync(filePath)
            ? Promise.resolve()
            : atomicWrite(filePath, MEMORY_TEMPLATES[file]);
        })
      );
      logger.info(`Parent project "${project}" auto-created at ${parentDir}`);
    }
  }

  const dir = projectPath(basePath, project, subproject);
  const created = !existsSync(dir);
  await mkdir(dir, { recursive: true });
  await Promise.all(
    MEMORY_FILES.map((file) => {
      const filePath = join(dir, file);
      return existsSync(filePath)
        ? Promise.resolve()
        : atomicWrite(filePath, MEMORY_TEMPLATES[file]);
    })
  );
  const label = subproject ? `${project}/${subproject}` : project;
  logger.info(`Project ${label} ${created ? "created" : "accessed"} at ${dir}`);
  return { dir, created };
}

export async function deleteProject(
  basePath: string,
  project: string,
  subproject?: string
): Promise<void> {
  const dir = projectPath(basePath, project, subproject);
  const label = subproject ? `${project}/${subproject}` : project;
  if (!existsSync(dir)) throw new Error(`Project not found: "${label}"`);
  await rm(dir, { recursive: true });
  logger.info(`Project ${label} deleted`);
}

/**
 * Promotes a subproject to a top-level project by moving its directory
 * from vault/project/subproject/ to vault/subproject/.
 */
export async function promoteSubProject(
  basePath: string,
  project: string,
  subproject: string
): Promise<void> {
  const srcDir = projectPath(basePath, project, subproject);
  if (!existsSync(srcDir)) {
    throw new Error(`Sub-project "${project}/${subproject}" not found`);
  }
  const destDir = projectPath(basePath, subproject);
  if (existsSync(destDir)) {
    throw new Error(
      `Cannot promote: a project named "${subproject}" already exists at the vault root`
    );
  }
  await rename(srcDir, destDir);
  logger.info(`Sub-project "${subproject}" promoted to project at ${destDir}`);
}

export async function readMemory(
  basePath: string,
  project: string,
  filename: string,
  subproject?: string
): Promise<string> {
  const dir = projectPath(basePath, project, subproject);
  const safe = validateFilename(filename);
  const filePath = join(dir, safe);
  if (!existsSync(filePath))
    throw new Error(`File not found: ${subproject ? `${project}/${subproject}` : project}/${safe}`);
  return await readFile(filePath, "utf-8");
}

export async function writeMemory(
  basePath: string,
  project: string,
  filename: string,
  content: string,
  subproject?: string
): Promise<void> {
  const label = subproject ? `${project}/${subproject}` : project;
  const dir = projectPath(basePath, project, subproject);
  if (!existsSync(dir)) {
    throw new Error(`Project not found: "${label}". Use create_project first.`);
  }
  const safe = validateFilename(filename);
  await atomicWrite(join(dir, safe), content);
  logger.info(`Updated memory: ${label}/${safe}`);
}

export async function appendMemory(
  basePath: string,
  project: string,
  filename: string,
  content: string,
  subproject?: string
): Promise<void> {
  const label = subproject ? `${project}/${subproject}` : project;
  const dir = projectPath(basePath, project, subproject);
  if (!existsSync(dir)) {
    throw new Error(`Project not found: "${label}". Use create_project first.`);
  }
  const safe = validateFilename(filename);
  if (APPEND_ONLY_FILES.includes(safe) && !DATE_HEADER_RE.test(content)) {
    const today = new Date().toISOString().slice(0, 10);
    throw new Error(
      `Content appended to "${safe}" must contain a date header in the format "## YYYY-MM-DD".\n` +
        `Example:\n## ${today}\n- Your entry here`
    );
  }
  const filePath = join(dir, safe);
  const lastChar = existsSync(filePath) ? await getLastChar(filePath) : "";
  const prefix = lastChar.length > 0 && lastChar !== "\n" ? "\n" : "";
  await appendFile(filePath, prefix + content, "utf-8");
  logger.info(`Appended memory to: ${label}/${safe}`);
}

export async function deleteMemory(
  basePath: string,
  project: string,
  filename: string,
  subproject?: string
): Promise<void> {
  const safe = validateFilename(filename);
  if ((MEMORY_FILES as readonly string[]).includes(safe)) {
    throw new Error(
      `Cannot delete standard file "${safe}". Use write_memory to clear its content instead.`
    );
  }
  const dir = projectPath(basePath, project, subproject);
  const label = subproject ? `${project}/${subproject}` : project;
  const filePath = join(dir, safe);
  if (!existsSync(filePath)) throw new Error(`File not found: ${label}/${safe}`);
  await unlink(filePath);
  logger.info(`Deleted custom memory: ${label}/${safe}`);
}

export interface ArchiveResult {
  archivedCount: number;
  keptCount: number;
  noDateCount: number;
  archiveFile: string;
}

export async function archiveMemory(
  basePath: string,
  project: string,
  filename: string,
  keepDays: number,
  subproject?: string
): Promise<ArchiveResult> {
  const label = subproject ? `${project}/${subproject}` : project;
  const dir = projectPath(basePath, project, subproject);
  if (!existsSync(dir)) throw new Error(`Project not found: "${label}"`);

  const safe = validateFilename(filename);
  if (!APPEND_ONLY_FILES.includes(safe)) {
    throw new Error(
      `archive_memory only supports append-only files: ${APPEND_ONLY_FILES.join(", ")}`
    );
  }

  const filePath = join(dir, safe);
  if (!existsSync(filePath)) throw new Error(`File not found: ${label}/${safe}`);

  const content = await readFile(filePath, "utf-8");
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);

  const rawSections = content.split(SECTION_SPLIT_RE);

  // Separate leading content with no date header from dated sections
  const noDateParts: string[] = [];
  const dated: Array<{ date: Date; text: string }> = [];

  for (const section of rawSections) {
    const match = section.match(DATE_HEADER_RE);
    if (!match?.[1]) {
      if (section.trim()) noDateParts.push(section);
      continue;
    }
    const d = new Date(match[1] + "T00:00:00Z");
    if (!isNaN(d.getTime())) dated.push({ date: d, text: section });
  }

  const toKeep = dated.filter((s) => s.date >= cutoff);
  const toArchive = dated.filter((s) => s.date < cutoff);

  if (toArchive.length === 0) {
    return {
      archivedCount: 0,
      keptCount: toKeep.length,
      noDateCount: noDateParts.length,
      archiveFile: "",
    };
  }

  // Build archive file name: progress-archive.md / decisions-archive.md
  const baseName = safe.replace(/\.md$/, "");
  const archiveFile = `${baseName}-archive.md`;
  const archivePath = join(dir, archiveFile);

  const archiveContent = toArchive.map((s) => s.text).join("");
  const archiveLastChar = existsSync(archivePath) ? await getLastChar(archivePath) : "";
  const archivePrefix = archiveLastChar && archiveLastChar !== "\n" ? "\n" : "";
  // Archive is written first: if the process crashes before the active file is updated,
  // entries appear in both files (duplicated) rather than being lost. Duplication is
  // detectable and recoverable; data loss is not.
  await appendFile(archivePath, archivePrefix + archiveContent, "utf-8");

  const activeContent = [...noDateParts, ...toKeep.map((s) => s.text)].join("");
  await atomicWrite(filePath, activeContent || MEMORY_TEMPLATES[safe as MemoryFile]);

  logger.info(`Archived ${toArchive.length} entries from ${label}/${safe} → ${archiveFile}`);
  return {
    archivedCount: toArchive.length,
    keptCount: toKeep.length,
    noDateCount: noDateParts.length,
    archiveFile,
  };
}

export interface InitAnswers {
  description?: string | undefined;
  goal?: string | undefined;
  phase?: string | undefined;
  architectureOverview?: string | undefined;
  components?: string | undefined;
  languages?: string | undefined;
  frameworks?: string | undefined;
  infrastructure?: string | undefined;
  nextSteps?: string | undefined;
}

export async function initProjectMemory(
  basePath: string,
  project: string,
  answers: InitAnswers,
  workspaceRoot?: string,
  originalPath?: string,
  subproject?: string
): Promise<string> {
  const { dir, created } = await createProject(basePath, project, subproject);
  const date = new Date().toISOString().slice(0, 10);
  const label = subproject ? `${project}/${subproject}` : project;
  const displayName = subproject ?? project;

  const filled: Record<MemoryFile, string> = {
    "memory.md": `# Memory

## Overview
- **Name:** ${displayName}
- **Description:** ${answers.description?.trim() ?? ""}
- **Goal:** ${answers.goal?.trim() ?? ""}

## Current Status
- **Phase:** ${answers.phase?.trim() ?? ""}
- **Last updated:** ${date}

## Key Components
${toList(answers.components)}

## Important Notes
-
`,

    "architecture.md": `# Architecture

## Overview
${answers.architectureOverview?.trim() ?? ""}

## Components
${toList(answers.components)}

## Data Flow

## External Integrations
-
`,

    "stack.md": `# Stack

## Languages
${toList(answers.languages)}

## Frameworks
${toList(answers.frameworks)}

## Libraries
-

## Infrastructure
${toList(answers.infrastructure)}

## Dev Tools
-
`,

    "decisions.md": MEMORY_TEMPLATES["decisions.md"],

    "progress.md": MEMORY_TEMPLATES["progress.md"],

    "next_steps.md": `# Next Steps

## Now
${toList(answers.nextSteps)}

## Soon
-

## Later
-

## Ideas
-
`,
  };

  const results = await Promise.all(
    MEMORY_FILES.map(async (file) => {
      const filePath = join(dir, file);
      let shouldWrite: boolean;
      if (created) {
        shouldWrite = true;
      } else {
        const existing = (await readFile(filePath, "utf-8")).trim();
        shouldWrite = !existing || existing === MEMORY_TEMPLATES_TRIMMED[file];
      }
      if (shouldWrite) {
        await atomicWrite(filePath, filled[file]);
        return file;
      }
      return null;
    })
  );
  const written = results.filter((f): f is MemoryFile => f !== null);

  let extra = "";
  if (workspaceRoot) {
    try {
      const configPath = join(workspaceRoot, ".luminavault.json");
      const configData: LocalVaultConfig = { project, path: originalPath || basePath };
      if (subproject) configData.subproject = subproject;
      await atomicWrite(configPath, JSON.stringify(configData, null, 2));
      extra = ` and local config ".luminavault.json" created at ${workspaceRoot}`;
    } catch (err) {
      logger.error(`Failed to create local config at ${workspaceRoot}`, err);
      extra = ` (but failed to create .luminavault.json: ${err instanceof Error ? err.message : String(err)})`;
    }
  }

  return written.length > 0
    ? `Project "${label}" initialized${extra}. Files written: ${written.join(", ")}`
    : `Project "${label}" already has content in all files${extra}. No files were overwritten.`;
}

export interface SearchResult {
  project: string;
  subproject?: string;
  file: string;
  line: number;
  text: string;
  context?: string[];
}

export interface SearchOutput {
  results: SearchResult[];
  truncated: boolean;
}

export async function searchMemory(
  basePath: string,
  query: string,
  project?: string,
  limit = 100,
  contextLines = 0,
  offset = 0,
  subproject?: string
): Promise<SearchOutput> {
  if (!query.trim()) {
    throw new Error("Search query cannot be empty.");
  }
  if (limit < 1) {
    throw new Error(`Invalid limit: ${limit}. Must be at least 1.`);
  }
  if (offset < 0) {
    throw new Error(`Invalid offset: ${offset}. Must be at least 0.`);
  }

  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();
  const cap = offset + limit + 1;

  const projects = project ? [project] : await listProjects(basePath);

  type SearchScope = { dir: string; proj: string; sub?: string };

  outer: for (const proj of projects) {
    let projDir: string;
    try {
      projDir = projectPath(basePath, proj);
    } catch (err) {
      if (project !== undefined) throw err;
      continue;
    }
    if (!existsSync(projDir)) continue;

    // Determine which dirs to search: specific subproject, all subprojects, or root only
    const scopes: SearchScope[] = [];

    if (subproject) {
      // Targeted subproject search
      const subDir = projectPath(basePath, proj, subproject);
      if (existsSync(subDir)) scopes.push({ dir: subDir, proj, sub: subproject });
    } else {
      // Root project files
      scopes.push({ dir: projDir, proj });
      // Plus all subprojects
      const subs = await listSubProjects(basePath, proj);
      for (const sub of subs) {
        scopes.push({ dir: join(projDir, sub), proj, sub });
      }
    }

    for (const scope of scopes) {
      if (!existsSync(scope.dir)) continue;
      const filesRaw = await readdir(scope.dir);
      const files = filesRaw.filter((f) => f.endsWith(".md")).sort();

      for (const file of files) {
        const filePath = join(scope.dir, file);
        const content = await readFile(filePath, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";
          if (line.toLowerCase().includes(lowerQuery)) {
            const result: SearchResult = {
              project: scope.proj,
              file,
              line: i + 1,
              text: line.trim(),
            };
            if (scope.sub) result.subproject = scope.sub;

            if (contextLines > 0) {
              const start = Math.max(0, i - contextLines);
              const end = Math.min(lines.length, i + contextLines + 1);
              result.context = lines.slice(start, end);
            }

            results.push(result);
            if (results.length === cap) break outer;
          }
        }
      }
    }
  }

  const hasMore = results.length === cap;
  return { results: results.slice(offset, offset + limit), truncated: hasMore };
}

export async function loadProjectContext(
  basePath: string,
  project: string,
  files?: string[],
  subproject?: string
): Promise<string> {
  const label = subproject ? `${project}/${subproject}` : project;
  const dir = projectPath(basePath, project, subproject);
  if (!existsSync(dir)) throw new Error(`Project not found: "${label}"`);

  const filesRaw = await readdir(dir);
  let candidates = filesRaw.filter((f) => f.endsWith(".md")).sort();

  if (files && files.length > 0) {
    const validated = new Set(files.map(validateFilename));
    candidates = candidates.filter((f) => validated.has(f));
  }

  const entries = await Promise.all(
    candidates.map(async (file) => {
      const content = (await readFile(join(dir, file), "utf-8")).trim();
      const knownTemplate = (MEMORY_TEMPLATES_TRIMMED as Record<string, string | undefined>)[file];
      const isBlankTemplate = knownTemplate !== undefined && content === knownTemplate;
      return content && !isBlankTemplate ? `## ${file}\n\n${content}` : null;
    })
  );
  const parts = entries.filter((p): p is string => p !== null);

  return parts.length > 0
    ? `# Context: ${label}\n\n${parts.join("\n\n---\n\n")}`
    : `# Context: ${label}\n\n(no content yet)`;
}

export interface HealthStatus {
  project: string;
  subproject?: string;
  files: Record<string, "ok" | "missing">;
  isHealthy: boolean;
}

export async function checkProjectHealth(
  basePath: string,
  project: string,
  subproject?: string
): Promise<HealthStatus> {
  const label = subproject ? `${project}/${subproject}` : project;
  const dir = projectPath(basePath, project, subproject);
  if (!existsSync(dir)) {
    throw new Error(`Project not found: "${label}"`);
  }

  const status: Record<string, "ok" | "missing"> = {};
  let isHealthy = true;

  for (const file of MEMORY_FILES) {
    const exists = existsSync(join(dir, file));
    status[file] = exists ? "ok" : "missing";
    if (!exists) isHealthy = false;
  }

  const result: HealthStatus = { project, files: status, isHealthy };
  if (subproject !== undefined) result.subproject = subproject;
  return result;
}

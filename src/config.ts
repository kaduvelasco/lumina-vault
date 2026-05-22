import { readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { z } from "zod";
import { atomicWrite } from "./utils/atomicWrite.js";

const CONFIG_DIR = join(homedir(), ".lumina-vault");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface GlobalConfig {
  globalVaultPath?: string;
  lastProject?: string;
  lastSubproject?: string;
}

const GlobalConfigSchema = z.object({
  globalVaultPath: z.string().optional(),
  lastProject: z.string().optional(),
  lastSubproject: z.string().optional(),
});

export async function readGlobalConfig(): Promise<GlobalConfig> {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    const result = GlobalConfigSchema.safeParse(JSON.parse(raw));
    return result.success ? (result.data as GlobalConfig) : {};
  } catch {
    return {};
  }
}

export async function writeGlobalConfig(config: GlobalConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await atomicWrite(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

export async function updateLastProject(project: string, subproject?: string): Promise<void> {
  const current = await readGlobalConfig();
  if (current.lastProject === project && current.lastSubproject === subproject) return;
  const updated: GlobalConfig = { ...current, lastProject: project };
  if (subproject !== undefined) {
    updated.lastSubproject = subproject;
  } else {
    delete updated.lastSubproject;
  }
  await writeGlobalConfig(updated);
}

import { readFile, writeFile, rename, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import { z } from "zod";

const CONFIG_DIR = join(homedir(), ".lumina-vault");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, content, "utf-8");
    await rename(tempPath, filePath);
  } catch (err) {
    if (existsSync(tempPath)) {
      await unlink(tempPath).catch(() => {});
    }
    throw err;
  }
}

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

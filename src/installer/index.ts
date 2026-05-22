import { spawnSync } from "child_process";
import { createInterface } from "readline";
import { existsSync } from "fs";
import { readFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { homedir } from "os";
import { atomicWrite } from "../utils/atomicWrite.js";
import { INSTALLER_TARGETS, TARGET_NAMES, type InstallerTarget } from "./targets.js";

const WHICH_TIMEOUT_MS = 5_000;
const INSTALL_TIMEOUT_MS = 30_000;

export function isCommandAvailable(command: string): boolean {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], { stdio: "pipe", timeout: WHICH_TIMEOUT_MS });
  return result.status === 0;
}

async function atomicWriteJson(filePath: string, data: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await atomicWrite(filePath, JSON.stringify(data, null, 2) + "\n");
}

async function installFileTarget(
  target: Extract<InstallerTarget, { kind: "file" }>
): Promise<"ok" | "skip" | "fail"> {
  const configPath = target.configPath(homedir());
  const presenceDir = target.presenceDir ? target.presenceDir(homedir()) : dirname(configPath);

  if (!existsSync(presenceDir)) {
    console.log(`  ⚠  ${target.name} — not found, skipping`);
    return "skip";
  }

  console.log(`\nInstalling into ${target.name}...`);

  try {
    let existing: Record<string, unknown> = {};
    try {
      const raw = await readFile(configPath, "utf-8");
      try {
        existing = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        console.error(`[${target.name}] Config file has invalid JSON — overwriting`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err; // unexpected read error — let outer catch handle it
      }
      // ENOENT is expected when the config file does not exist yet
    }

    const merged = target.mergeConfig(existing);
    await atomicWriteJson(configPath, merged);
    console.log(`  ✓  ${target.name} — done`);
    return "ok";
  } catch (err) {
    console.error(`[${target.name}]`, err);
    console.log(`  ✗  ${target.name} — failed`);
    return "fail";
  }
}

export async function installTarget(target: InstallerTarget): Promise<"ok" | "skip" | "fail"> {
  if (target.kind === "file") {
    return installFileTarget(target);
  }

  if (!isCommandAvailable(target.command)) {
    console.log(`  ⚠  ${target.name} — not found, skipping`);
    return "skip";
  }

  console.log(`\nInstalling into ${target.name}...`);

  const result = spawnSync(target.command, [...target.args], {
    stdio: "inherit",
    shell: process.platform === "win32",
    timeout: INSTALL_TIMEOUT_MS,
  });

  if (result.status !== 0) {
    console.log(`  ✗  ${target.name} — failed (exit code ${result.status ?? "unknown"})`);
    return "fail";
  }

  console.log(`  ✓  ${target.name} — done`);
  return "ok";
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

export async function runInstall(args: string[]): Promise<void> {
  const targetName = args[0]?.trim().toLowerCase();

  if (targetName) {
    const target = INSTALLER_TARGETS.find((t) => t.name === targetName);
    if (!target) {
      console.error(`Unknown target: "${targetName}"\nAvailable: ${TARGET_NAMES.join(", ")}`);
      process.exit(1);
    }
    await installTarget(target);
    return;
  }

  console.log("The following targets will be configured:");
  TARGET_NAMES.forEach((name) => console.log(`  - ${name}`));
  console.log("");

  const answer = await prompt("Proceed with all? [y/N] ");
  if (answer !== "y" && answer !== "yes") {
    console.log("Aborted.");
    return;
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const target of INSTALLER_TARGETS) {
    const result = await installTarget(target);
    if (result === "ok") ok++;
    else if (result === "skip") skipped++;
    else failed++;
  }

  console.log(`\nDone. ${ok} installed, ${skipped} skipped, ${failed} failed.`);
}

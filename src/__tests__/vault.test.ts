import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";
import {
  readLocalConfig,
  listSubProjects,
  createProject,
  deleteProject,
  promoteSubProject,
  MEMORY_FILES,
} from "../vault.js";

async function writeConfig(dir: string, content: object): Promise<void> {
  await writeFile(join(dir, ".luminavault.json"), JSON.stringify(content, null, 2));
}

describe("readLocalConfig", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "lumina-vault-test-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns null when no .luminavault.json exists anywhere in the tree", async () => {
    const deep = join(root, "a", "b", "c");
    await mkdir(deep, { recursive: true });
    expect(await readLocalConfig(deep)).toBeNull();
  });

  it("finds .luminavault.json at the workspace_root itself", async () => {
    await writeConfig(root, { project: "my-project" });
    const result = await readLocalConfig(root);
    expect(result).not.toBeNull();
    expect(result!.project).toBe("my-project");
    expect(result!.configRoot).toBe(root);
    expect(result!.subproject).toBeUndefined();
  });

  it("walks up directories to find .luminavault.json", async () => {
    await writeConfig(root, { project: "root-project" });
    const deep = join(root, "src", "utils");
    await mkdir(deep, { recursive: true });

    const result = await readLocalConfig(deep);
    expect(result).not.toBeNull();
    expect(result!.project).toBe("root-project");
    expect(result!.configRoot).toBe(root);
    expect(result!.subproject).toBeUndefined();
  });

  it("reads subproject field when present in config", async () => {
    await writeConfig(root, { project: "my-app", subproject: "my-plugin" });
    const result = await readLocalConfig(root);
    expect(result).not.toBeNull();
    expect(result!.project).toBe("my-app");
    expect(result!.subproject).toBe("my-plugin");
    expect(result!.configRoot).toBe(root);
  });

  it("finds .luminavault.json with subproject walking up from nested dir", async () => {
    const subDir = join(root, "plugin");
    await mkdir(subDir, { recursive: true });
    await writeConfig(subDir, { project: "my-app", subproject: "my-plugin" });

    const deep = join(subDir, "src", "handlers");
    await mkdir(deep, { recursive: true });

    const result = await readLocalConfig(deep);
    expect(result!.project).toBe("my-app");
    expect(result!.subproject).toBe("my-plugin");
  });

  it("returns null for invalid JSON", async () => {
    await writeFile(join(root, ".luminavault.json"), "{ invalid json }");
    expect(await readLocalConfig(root)).toBeNull();
  });

  it("returns null when project field is missing", async () => {
    await writeConfig(root, { path: "/some/path" });
    expect(await readLocalConfig(root)).toBeNull();
  });
});

describe("listSubProjects", () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "lumina-vault-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it("returns empty array when project has no subprojects", async () => {
    await createProject(basePath, "my-project");
    const subs = await listSubProjects(basePath, "my-project");
    expect(subs).toEqual([]);
  });

  it("returns empty array when project does not exist", async () => {
    const subs = await listSubProjects(basePath, "nonexistent");
    expect(subs).toEqual([]);
  });

  it("detects subprojects by presence of memory files", async () => {
    await createProject(basePath, "my-project");
    await createProject(basePath, "my-project", "plugin-a");
    await createProject(basePath, "my-project", "plugin-b");

    const subs = await listSubProjects(basePath, "my-project");
    expect(subs).toEqual(["plugin-a", "plugin-b"]);
  });

  it("ignores subdirectories without memory files", async () => {
    await createProject(basePath, "my-project");
    // Create a plain dir without memory files
    await mkdir(join(basePath, "my-project", "assets"), { recursive: true });

    const subs = await listSubProjects(basePath, "my-project");
    expect(subs).toEqual([]);
  });
});

describe("createProject with subproject", () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "lumina-vault-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it("creates vault/project/subproject/ with memory files", async () => {
    const { dir, created } = await createProject(basePath, "my-app", "my-plugin");
    expect(created).toBe(true);
    expect(dir).toBe(join(basePath, "my-app", "my-plugin"));
    for (const file of MEMORY_FILES) {
      expect(existsSync(join(dir, file))).toBe(true);
    }
  });

  it("auto-creates parent project when it does not exist", async () => {
    await createProject(basePath, "my-app", "my-plugin");
    const parentDir = join(basePath, "my-app");
    expect(existsSync(parentDir)).toBe(true);
    expect(existsSync(join(parentDir, "memory.md"))).toBe(true);
  });

  it("returns created: false when subproject already exists", async () => {
    await createProject(basePath, "my-app", "my-plugin");
    const { created } = await createProject(basePath, "my-app", "my-plugin");
    expect(created).toBe(false);
  });
});

describe("deleteProject with subproject", () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "lumina-vault-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it("deletes only the subproject directory", async () => {
    await createProject(basePath, "my-app");
    await createProject(basePath, "my-app", "my-plugin");

    await deleteProject(basePath, "my-app", "my-plugin");

    expect(existsSync(join(basePath, "my-app"))).toBe(true);
    expect(existsSync(join(basePath, "my-app", "my-plugin"))).toBe(false);
  });

  it("throws when subproject does not exist", async () => {
    await createProject(basePath, "my-app");
    await expect(deleteProject(basePath, "my-app", "nonexistent")).rejects.toThrow(
      "Project not found"
    );
  });
});

describe("promoteSubProject", () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "lumina-vault-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it("moves subproject to vault root", async () => {
    await createProject(basePath, "my-app", "my-plugin");

    await promoteSubProject(basePath, "my-app", "my-plugin");

    expect(existsSync(join(basePath, "my-app", "my-plugin"))).toBe(false);
    expect(existsSync(join(basePath, "my-plugin"))).toBe(true);
    expect(existsSync(join(basePath, "my-plugin", "memory.md"))).toBe(true);
  });

  it("throws when subproject does not exist", async () => {
    await createProject(basePath, "my-app");
    await expect(promoteSubProject(basePath, "my-app", "nonexistent")).rejects.toThrow(
      "Sub-project"
    );
  });

  it("throws when a project with the same name already exists at vault root", async () => {
    await createProject(basePath, "my-app", "my-plugin");
    await createProject(basePath, "my-plugin");

    await expect(promoteSubProject(basePath, "my-app", "my-plugin")).rejects.toThrow(
      "Cannot promote"
    );
  });
});

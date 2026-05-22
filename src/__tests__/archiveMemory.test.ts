import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";
import { createProject, appendMemory, archiveMemory } from "../vault.js";

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("appendMemory — date format enforcement", () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "lumina-vault-test-"));
    await createProject(basePath, "my-project");
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it("accepts content with a valid date header", async () => {
    await expect(
      appendMemory(basePath, "my-project", "progress.md", `## ${daysAgo(0)}\n- did something`)
    ).resolves.toBeUndefined();
  });

  it("rejects content without a date header in progress.md", async () => {
    await expect(
      appendMemory(basePath, "my-project", "progress.md", "- did something without a date")
    ).rejects.toThrow("## YYYY-MM-DD");
  });

  it("rejects content without a date header in decisions.md", async () => {
    await expect(
      appendMemory(basePath, "my-project", "decisions.md", "Decided something")
    ).rejects.toThrow("## YYYY-MM-DD");
  });

  it("does not enforce date format on non-append-only files", async () => {
    await expect(
      appendMemory(basePath, "my-project", "memory.md", "Some free-form content")
    ).resolves.toBeUndefined();
  });
});

describe("archiveMemory", () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "lumina-vault-test-"));
    await createProject(basePath, "my-project");
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  async function writeProgress(entries: Array<{ daysOld: number; text: string }>) {
    for (const entry of entries) {
      await appendMemory(
        basePath,
        "my-project",
        "progress.md",
        `## ${daysAgo(entry.daysOld)}\n${entry.text}`
      );
    }
  }

  it("returns archivedCount 0 when all entries are within keep_days", async () => {
    await writeProgress([{ daysOld: 5, text: "- recent work" }]);
    const result = await archiveMemory(basePath, "my-project", "progress.md", 30);
    expect(result.archivedCount).toBe(0);
    expect(result.keptCount).toBe(1);
    expect(result.archiveFile).toBe("");
  });

  it("moves entries older than keep_days to progress-archive.md", async () => {
    await writeProgress([
      { daysOld: 60, text: "- old work" },
      { daysOld: 10, text: "- recent work" },
    ]);

    const result = await archiveMemory(basePath, "my-project", "progress.md", 30);

    expect(result.archivedCount).toBe(1);
    expect(result.keptCount).toBe(1);
    expect(result.archiveFile).toBe("progress-archive.md");

    const active = await readFile(join(basePath, "my-project", "progress.md"), "utf-8");
    expect(active).toContain("recent work");
    expect(active).not.toContain("old work");

    const archive = await readFile(join(basePath, "my-project", "progress-archive.md"), "utf-8");
    expect(archive).toContain("old work");
    expect(archive).not.toContain("recent work");
  });

  it("archives all entries when all are older than keep_days", async () => {
    await writeProgress([
      { daysOld: 100, text: "- very old" },
      { daysOld: 200, text: "- ancient" },
    ]);

    const result = await archiveMemory(basePath, "my-project", "progress.md", 30);

    expect(result.archivedCount).toBe(2);
    expect(result.keptCount).toBe(0);

    const active = await readFile(join(basePath, "my-project", "progress.md"), "utf-8");
    expect(active).not.toContain("very old");
    expect(active).not.toContain("ancient");
    // Template header is undated content and must be preserved
    expect(active).toContain("# Progress");
  });

  it("restores template when file has no header and all entries are archived", async () => {
    // Overwrite the file with only a dated entry (no # Progress header)
    const { writeMemory } = await import("../vault.js");
    await writeMemory(basePath, "my-project", "progress.md", `## ${daysAgo(100)}\n- headerless`);

    const result = await archiveMemory(basePath, "my-project", "progress.md", 30);

    expect(result.archivedCount).toBe(1);
    expect(result.keptCount).toBe(0);

    const active = await readFile(join(basePath, "my-project", "progress.md"), "utf-8");
    expect(active).not.toContain("headerless");
    // Must not be an empty file — template is restored as fallback
    expect(active.trim()).not.toBe("");
    expect(active).toContain("# Progress");
  });

  it("appends to existing archive file without overwriting it", async () => {
    await writeProgress([{ daysOld: 60, text: "- first old entry" }]);
    await archiveMemory(basePath, "my-project", "progress.md", 30);

    await writeProgress([{ daysOld: 45, text: "- second old entry" }]);
    await archiveMemory(basePath, "my-project", "progress.md", 30);

    const archive = await readFile(join(basePath, "my-project", "progress-archive.md"), "utf-8");
    expect(archive).toContain("first old entry");
    expect(archive).toContain("second old entry");
  });

  it("throws when filename is not an append-only file", async () => {
    await expect(archiveMemory(basePath, "my-project", "memory.md", 30)).rejects.toThrow(
      "append-only"
    );
  });

  it("throws when project does not exist", async () => {
    await expect(archiveMemory(basePath, "nonexistent", "progress.md", 30)).rejects.toThrow(
      "Project not found"
    );
  });

  it("creates archive file only when there is something to archive", async () => {
    await writeProgress([{ daysOld: 5, text: "- recent" }]);
    await archiveMemory(basePath, "my-project", "progress.md", 30);
    expect(existsSync(join(basePath, "my-project", "progress-archive.md"))).toBe(false);
  });
});

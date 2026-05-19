import { describe, it, expect, vi, beforeEach } from "vitest";
import { ArchiveMemoryHandler } from "../handlers/ArchiveMemoryHandler.js";
import * as vault from "../vault.js";

vi.mock("../vault.js", () => ({
  archiveMemory: vi.fn(),
  APPEND_ONLY_FILES: ["progress.md", "decisions.md"],
  resolveBasePath: vi.fn((p: string) => `/resolved${p}`),
  readLocalConfig: vi.fn().mockResolvedValue(null),
}));

vi.mock("../config.js", () => ({
  readGlobalConfig: vi.fn().mockResolvedValue({}),
  updateLastProject: vi.fn().mockResolvedValue(undefined),
}));

describe("ArchiveMemoryHandler", () => {
  const basePath = "/tmp/vault";
  let handler: ArchiveMemoryHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new ArchiveMemoryHandler(basePath);
  });

  it("should report archived entries correctly", async () => {
    vi.mocked(vault.archiveMemory).mockResolvedValue({
      archivedCount: 5,
      keptCount: 3,
      noDateCount: 0,
      archiveFile: "progress-archive.md",
    });

    const args = handler.validate({
      project: "my-project",
      filename: "progress.md",
      keep_days: 90,
    });
    const result = await handler.execute(args);

    expect(vault.archiveMemory).toHaveBeenCalledWith(
      basePath,
      "my-project",
      "progress.md",
      90,
      undefined
    );
    expect(result.content[0]!.text).toContain("Archived 5");
    expect(result.content[0]!.text).toContain("progress-archive.md");
    expect(result.content[0]!.text).toContain("3 kept");
  });

  it("should report nothing to archive when all entries are recent", async () => {
    vi.mocked(vault.archiveMemory).mockResolvedValue({
      archivedCount: 0,
      keptCount: 4,
      noDateCount: 0,
      archiveFile: "",
    });

    const args = handler.validate({ project: "my-project", filename: "progress.md" });
    const result = await handler.execute(args);

    expect(result.content[0]!.text).toContain("Nothing to archive");
    expect(result.content[0]!.text).toContain("4 entries");
  });

  it("should use default keep_days of 90", async () => {
    vi.mocked(vault.archiveMemory).mockResolvedValue({
      archivedCount: 0,
      keptCount: 0,
      noDateCount: 0,
      archiveFile: "",
    });

    const args = handler.validate({ project: "my-project", filename: "decisions.md" });
    expect(args.keep_days).toBe(90);
  });

  it("should mention undated entries when present", async () => {
    vi.mocked(vault.archiveMemory).mockResolvedValue({
      archivedCount: 2,
      keptCount: 1,
      noDateCount: 1,
      archiveFile: "decisions-archive.md",
    });

    const args = handler.validate({
      project: "my-project",
      filename: "decisions.md",
      keep_days: 30,
    });
    const result = await handler.execute(args);

    expect(result.content[0]!.text).toContain("1 undated");
  });
});

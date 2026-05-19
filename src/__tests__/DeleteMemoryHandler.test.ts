import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { DeleteMemoryHandler } from "../handlers/DeleteMemoryHandler.js";
import * as vault from "../vault.js";

vi.mock("../vault.js", () => ({
  deleteMemory: vi.fn(),
  MEMORY_FILES: ["memory.md"],
  readLocalConfig: vi.fn().mockResolvedValue(null),
  resolveBasePath: vi.fn((p: string) => `/resolved${p}`),
}));

vi.mock("../config.js", () => ({
  readGlobalConfig: vi.fn().mockResolvedValue({}),
  updateLastProject: vi.fn().mockResolvedValue(undefined),
}));

describe("DeleteMemoryHandler", () => {
  const basePath = "/tmp/vault";
  let handler: DeleteMemoryHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new DeleteMemoryHandler(basePath);
  });

  it("should delete memory file", async () => {
    vi.mocked(vault.deleteMemory).mockResolvedValue();

    const result = await handler.execute({
      project: "p",
      filename: "custom.md",
    });

    expect(vault.deleteMemory).toHaveBeenCalledWith(basePath, "p", "custom.md", undefined);
    expect(result.content[0]!.text).toContain("Deleted: p/custom.md");
  });

  it("should return needs-input message when no project can be discovered", async () => {
    const result = await handler.execute({ filename: "custom.md" });

    expect(result.content[0]!.text).toContain("Could not determine");
    expect(vault.deleteMemory).not.toHaveBeenCalled();
  });

  it("should reject empty filename", () => {
    expect(() => handler.validate({ project: "p", filename: "" })).toThrow();
  });

  it("should throw McpError when deleteMemory fails", async () => {
    vi.mocked(vault.deleteMemory).mockRejectedValue(new Error("permission denied"));

    await expect(handler.execute({ project: "p", filename: "custom.md" })).rejects.toThrow(
      McpError
    );
  });
});

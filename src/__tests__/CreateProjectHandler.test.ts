import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateProjectHandler } from "../handlers/CreateProjectHandler.js";
import * as vault from "../vault.js";

vi.mock("../vault.js", () => ({
  createProject: vi.fn(),
  MEMORY_FILES: ["memory.md", "architecture.md"],
  resolveBasePath: vi.fn((p: string) => p),
}));

describe("CreateProjectHandler", () => {
  const basePath = "/tmp/vault";
  let handler: CreateProjectHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new CreateProjectHandler(basePath);
  });

  it("should validate input correctly", () => {
    expect(() => handler.validate({ project: "my-project" })).not.toThrow();
    expect(() => handler.validate({})).toThrow();
    expect(() => handler.validate({ project: "" })).toThrow();
  });

  it("should create a project successfully", async () => {
    vi.mocked(vault.createProject).mockResolvedValue({
      dir: "/tmp/vault/my-project",
      created: true,
    });

    const result = await handler.execute({ project: "my-project" });

    expect(vault.createProject).toHaveBeenCalledWith(basePath, "my-project", undefined);
    expect(result.content[0]!.text).toContain('Project "my-project" created');
  });

  it("should handle already existing project", async () => {
    vi.mocked(vault.createProject).mockResolvedValue({
      dir: "/tmp/vault/my-project",
      created: false,
    });

    const result = await handler.execute({ project: "my-project" });

    expect(result.content[0]!.text).toContain('Project "my-project" already exists');
  });

  it("should create a subproject under the parent project", async () => {
    vi.mocked(vault.createProject).mockResolvedValue({
      dir: "/tmp/vault/my-project/my-plugin",
      created: true,
    });

    const result = await handler.execute({ project: "my-project", subproject: "my-plugin" });

    expect(vault.createProject).toHaveBeenCalledWith(basePath, "my-project", "my-plugin");
    expect(result.content[0]!.text).toContain('Project "my-project/my-plugin" created');
  });
});

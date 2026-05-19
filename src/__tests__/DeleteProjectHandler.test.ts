import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteProjectHandler } from "../handlers/DeleteProjectHandler.js";
import * as vault from "../vault.js";

vi.mock("../vault.js", () => ({
  deleteProject: vi.fn(),
  promoteSubProject: vi.fn(),
  listSubProjects: vi.fn(),
  resolveBasePath: vi.fn((p: string) => p),
}));

describe("DeleteProjectHandler", () => {
  const basePath = "/tmp/vault";
  let handler: DeleteProjectHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new DeleteProjectHandler(basePath);
  });

  it("requires confirm: true", async () => {
    const result = await handler.execute({ project: "my-app", confirm: false });
    expect(result.isError).toBe(true);
    expect(vault.deleteProject).not.toHaveBeenCalled();
  });

  it("deletes a specific subproject when subproject param is provided", async () => {
    vi.mocked(vault.deleteProject).mockResolvedValue(undefined);

    const result = await handler.execute({
      project: "my-app",
      subproject: "my-plugin",
      confirm: true,
    });

    expect(vault.deleteProject).toHaveBeenCalledWith(basePath, "my-app", "my-plugin");
    expect(result.content[0]!.text).toContain("my-app/my-plugin");
  });

  it("returns warning when project has subprojects and no subproject_action given", async () => {
    vi.mocked(vault.listSubProjects).mockResolvedValue(["plugin-a", "plugin-b"]);

    const result = await handler.execute({ project: "my-app", confirm: true });

    expect(vault.deleteProject).not.toHaveBeenCalled();
    expect(result.content[0]!.text).toContain("subproject_action");
    expect(result.content[0]!.text).toContain("plugin-a");
  });

  it("cancels deletion when subproject_action is cancel", async () => {
    vi.mocked(vault.listSubProjects).mockResolvedValue(["plugin-a"]);

    const result = await handler.execute({
      project: "my-app",
      confirm: true,
      subproject_action: "cancel",
    });

    expect(vault.deleteProject).not.toHaveBeenCalled();
    expect(result.content[0]!.text).toContain("cancelled");
  });

  it("promotes all subprojects then deletes parent when subproject_action is promote", async () => {
    vi.mocked(vault.listSubProjects).mockResolvedValue(["plugin-a", "plugin-b"]);
    vi.mocked(vault.promoteSubProject).mockResolvedValue(undefined);
    vi.mocked(vault.deleteProject).mockResolvedValue(undefined);

    const result = await handler.execute({
      project: "my-app",
      confirm: true,
      subproject_action: "promote",
    });

    expect(vault.promoteSubProject).toHaveBeenCalledWith(basePath, "my-app", "plugin-a");
    expect(vault.promoteSubProject).toHaveBeenCalledWith(basePath, "my-app", "plugin-b");
    expect(vault.deleteProject).toHaveBeenCalledWith(basePath, "my-app");
    expect(result.content[0]!.text).toContain("promoted");
  });

  it("deletes project and all subprojects when subproject_action is delete_all", async () => {
    vi.mocked(vault.listSubProjects).mockResolvedValue(["plugin-a"]);
    vi.mocked(vault.deleteProject).mockResolvedValue(undefined);

    const result = await handler.execute({
      project: "my-app",
      confirm: true,
      subproject_action: "delete_all",
    });

    expect(vault.deleteProject).toHaveBeenCalledWith(basePath, "my-app");
    expect(result.content[0]!.text).toContain("plugin-a");
  });
});

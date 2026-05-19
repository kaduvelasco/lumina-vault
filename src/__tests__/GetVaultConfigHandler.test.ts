import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetVaultConfigHandler } from "../handlers/GetVaultConfigHandler.js";
import * as config from "../config.js";
import * as vault from "../vault.js";

vi.mock("../config.js", () => ({
  readGlobalConfig: vi.fn(),
}));

vi.mock("../vault.js", () => ({
  readLocalConfig: vi.fn().mockResolvedValue(null),
  listSubProjects: vi.fn().mockResolvedValue([]),
  resolveBasePath: vi.fn((p: string) => p),
}));

describe("GetVaultConfigHandler", () => {
  const basePath = "/tmp/vault";
  let handler: GetVaultConfigHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new GetVaultConfigHandler(basePath);
  });

  it("should have the correct tool name", () => {
    expect(handler.name).toBe("get_vault_config");
  });

  it("should accept empty input and workspace_root", () => {
    expect(() => handler.validate({})).not.toThrow();
    expect(() => handler.validate({ workspace_root: "/some/path" })).not.toThrow();
  });

  it("should report no global vault and no last project when config is empty", async () => {
    vi.mocked(config.readGlobalConfig).mockResolvedValue({});

    const result = await handler.execute({});
    const data = JSON.parse(result.content[0]!.text);

    expect(data.active_vault).toBe(basePath);
    expect(data.global_vault_configured).toBe(false);
    expect(data.global_vault_path).toBeNull();
    expect(data.last_project).toBeNull();
    expect(data.last_subproject).toBeNull();
  });

  it("should report global vault and last project when configured", async () => {
    vi.mocked(config.readGlobalConfig).mockResolvedValue({
      globalVaultPath: "/custom/vault",
      lastProject: "my-app",
      lastSubproject: "my-plugin",
    });

    const result = await handler.execute({});
    const data = JSON.parse(result.content[0]!.text);

    expect(data.global_vault_configured).toBe(true);
    expect(data.global_vault_path).toBe("/custom/vault");
    expect(data.last_project).toBe("my-app");
    expect(data.last_subproject).toBe("my-plugin");
  });

  it("should include local_config with subprojects when workspace_root is provided", async () => {
    vi.mocked(config.readGlobalConfig).mockResolvedValue({});
    vi.mocked(vault.readLocalConfig).mockResolvedValue({
      project: "my-app",
      subproject: "my-plugin",
      configRoot: "/path/to/plugin",
    });
    vi.mocked(vault.listSubProjects).mockResolvedValue(["my-plugin", "other-plugin"]);

    const result = await handler.execute({ workspace_root: "/path/to/plugin" });
    const data = JSON.parse(result.content[0]!.text);

    expect(data.local_config).toBeDefined();
    expect(data.local_config.project).toBe("my-app");
    expect(data.local_config.subproject).toBe("my-plugin");
    expect(data.local_config.subprojects).toEqual(["my-plugin", "other-plugin"]);
    expect(data.local_config.config_root).toBe("/path/to/plugin");
  });

  it("should set local_config to null when workspace_root has no .luminavault.json", async () => {
    vi.mocked(config.readGlobalConfig).mockResolvedValue({});
    vi.mocked(vault.readLocalConfig).mockResolvedValue(null);

    const result = await handler.execute({ workspace_root: "/some/path" });
    const data = JSON.parse(result.content[0]!.text);

    expect(data.local_config).toBeNull();
  });

  it("should not include local_config when workspace_root is not provided", async () => {
    vi.mocked(config.readGlobalConfig).mockResolvedValue({});

    const result = await handler.execute({});
    const data = JSON.parse(result.content[0]!.text);

    expect(data.local_config).toBeUndefined();
    expect(vault.readLocalConfig).not.toHaveBeenCalled();
  });
});

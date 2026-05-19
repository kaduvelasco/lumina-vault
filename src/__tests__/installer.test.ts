import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("readline", () => ({
  createInterface: vi.fn(),
}));

import { spawnSync } from "child_process";
import { createInterface } from "readline";
import { isCommandAvailable, installTarget, runInstall } from "../installer/index.js";
import { INSTALLER_TARGETS, type FileTarget } from "../installer/targets.js";

const mockSpawnSync = vi.mocked(spawnSync);
const mockCreateInterface = vi.mocked(createInterface);

const CLI_TARGETS = INSTALLER_TARGETS.filter((t) => t.kind === "cli");
const FILE_TARGETS = INSTALLER_TARGETS.filter((t) => t.kind === "file") as FileTarget[];

function mockPrompt(answer: string) {
  mockCreateInterface.mockReturnValue({
    question: (_q: string, cb: (a: string) => void) => cb(answer),
    close: vi.fn(),
  } as unknown as ReturnType<typeof createInterface>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isCommandAvailable", () => {
  it("returns true when the checker exits with 0", () => {
    mockSpawnSync.mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);
    expect(isCommandAvailable("claude")).toBe(true);
  });

  it("returns false when the checker exits non-zero", () => {
    mockSpawnSync.mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);
    expect(isCommandAvailable("ghost")).toBe(false);
  });
});

describe("installTarget — CliTarget", () => {
  const target = INSTALLER_TARGETS.find((t) => t.name === "claude")!;

  it("returns 'skip' when command is not available", async () => {
    mockSpawnSync.mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);
    expect(await installTarget(target)).toBe("skip");
  });

  it("returns 'ok' when command runs successfully", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>) // which/where
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>); // install
    expect(await installTarget(target)).toBe("ok");
  });

  it("returns 'fail' when install command exits non-zero", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>) // which/where
      .mockReturnValueOnce({ status: 1 } as ReturnType<typeof spawnSync>); // install
    expect(await installTarget(target)).toBe("fail");
  });
});

describe("installTarget — FileTarget", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "lumina-vault-installer-test-"));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  function makeTarget(
    name: string,
    subPath: string,
    mergeConfig: FileTarget["mergeConfig"]
  ): FileTarget {
    return {
      kind: "file",
      name,
      configPath: () => join(baseDir, subPath),
      mergeConfig,
    };
  }

  it("returns 'skip' when parent directory does not exist", async () => {
    const target = makeTarget("test-tool", join("nonexistent", "mcp.json"), (e) => e);
    expect(await installTarget(target)).toBe("skip");
  });

  it("creates config file when parent exists but file does not", async () => {
    const toolDir = join(baseDir, ".cursor");
    await mkdir(toolDir);
    const cursorTarget = FILE_TARGETS.find((t) => t.name === "cursor")!;
    const target = makeTarget("cursor", join(".cursor", "mcp.json"), cursorTarget.mergeConfig);

    expect(await installTarget(target)).toBe("ok");

    const content = JSON.parse(await readFile(join(toolDir, "mcp.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    expect(content).toHaveProperty("mcpServers.lumina-vault");
  });

  it("merges into existing config without losing other keys", async () => {
    const toolDir = join(baseDir, ".cursor");
    await mkdir(toolDir);
    const configFile = join(toolDir, "mcp.json");
    await writeFile(
      configFile,
      JSON.stringify({ mcpServers: { "other-tool": { command: "x" } }, extraKey: true }, null, 2)
    );

    const cursorTarget = FILE_TARGETS.find((t) => t.name === "cursor")!;
    const target = makeTarget("cursor", join(".cursor", "mcp.json"), cursorTarget.mergeConfig);

    expect(await installTarget(target)).toBe("ok");

    const content = JSON.parse(await readFile(configFile, "utf-8")) as Record<string, unknown>;
    const servers = content["mcpServers"] as Record<string, unknown>;
    expect(servers).toHaveProperty("other-tool");
    expect(servers).toHaveProperty("lumina-vault");
    expect(content["extraKey"]).toBe(true);
  });

  it("overwrites and returns 'ok' when existing JSON is corrupted", async () => {
    const toolDir = join(baseDir, ".cursor");
    await mkdir(toolDir);
    const configFile = join(toolDir, "mcp.json");
    await writeFile(configFile, "{ not valid json %%% }");

    const cursorTarget = FILE_TARGETS.find((t) => t.name === "cursor")!;
    const target = makeTarget("cursor", join(".cursor", "mcp.json"), cursorTarget.mergeConfig);

    expect(await installTarget(target)).toBe("ok");

    const content = JSON.parse(await readFile(configFile, "utf-8")) as Record<string, unknown>;
    expect(content).toHaveProperty("mcpServers.lumina-vault");
  });

  it("writes correct Zed context_servers structure", async () => {
    const zedDir = join(baseDir, ".config", "zed");
    await mkdir(zedDir, { recursive: true });
    const zedTarget = FILE_TARGETS.find((t) => t.name === "zed")!;
    const target = makeTarget(
      "zed",
      join(".config", "zed", "settings.json"),
      zedTarget.mergeConfig
    );

    expect(await installTarget(target)).toBe("ok");

    const content = JSON.parse(await readFile(join(zedDir, "settings.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    const servers = content["context_servers"] as Record<string, unknown>;
    expect(servers).toHaveProperty("lumina-vault");
    const entry = servers["lumina-vault"] as Record<string, unknown>;
    expect((entry["command"] as Record<string, unknown>)["path"]).toBe("npx");
  });

  it("is idempotent — repeated install produces a single lumina-vault entry", async () => {
    const toolDir = join(baseDir, ".cursor");
    await mkdir(toolDir);
    const cursorTarget = FILE_TARGETS.find((t) => t.name === "cursor")!;
    const target = makeTarget("cursor", join(".cursor", "mcp.json"), cursorTarget.mergeConfig);

    await installTarget(target);
    await installTarget(target);

    const content = JSON.parse(await readFile(join(toolDir, "mcp.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    const servers = content["mcpServers"] as Record<string, unknown>;
    expect(Object.keys(servers)).toHaveLength(1);
    expect(servers).toHaveProperty("lumina-vault");
  });

  it("preserves existing mcpServers when its value is not a plain object", async () => {
    const toolDir = join(baseDir, ".cursor");
    await mkdir(toolDir);
    const configFile = join(toolDir, "mcp.json");
    // malformed: mcpServers is an array instead of an object
    await writeFile(configFile, JSON.stringify({ mcpServers: ["bad-value"] }, null, 2));

    const cursorTarget = FILE_TARGETS.find((t) => t.name === "cursor")!;
    const target = makeTarget("cursor", join(".cursor", "mcp.json"), cursorTarget.mergeConfig);

    expect(await installTarget(target)).toBe("ok");

    const content = JSON.parse(await readFile(configFile, "utf-8")) as Record<string, unknown>;
    const servers = content["mcpServers"] as Record<string, unknown>;
    // the bad array is replaced by a clean object containing only lumina-vault
    expect(servers).toHaveProperty("lumina-vault");
    expect(Array.isArray(servers)).toBe(false);
  });

  it("returns 'fail' and leaves no temp files when write fails", async () => {
    const toolDir = join(baseDir, ".cursor");
    await mkdir(toolDir);
    // create a directory at the target path — rename will fail with EISDIR
    await mkdir(join(toolDir, "mcp.json"));

    const cursorTarget = FILE_TARGETS.find((t) => t.name === "cursor")!;
    const target = makeTarget("cursor", join(".cursor", "mcp.json"), cursorTarget.mergeConfig);

    expect(await installTarget(target)).toBe("fail");

    const files = await readdir(toolDir);
    expect(files.filter((f) => f.endsWith(".tmp") || f.endsWith(".dead"))).toHaveLength(0);
  });

  it("writes correct Cline mcpServers structure with disabled and autoApprove", async () => {
    const clineDir = join(
      baseDir,
      ".config",
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings"
    );
    await mkdir(clineDir, { recursive: true });
    const clineTarget = FILE_TARGETS.find((t) => t.name === "cline")!;
    const target = makeTarget(
      "cline",
      join(
        ".config",
        "Code",
        "User",
        "globalStorage",
        "saoudrizwan.claude-dev",
        "settings",
        "cline_mcp_settings.json"
      ),
      clineTarget.mergeConfig
    );

    expect(await installTarget(target)).toBe("ok");

    const content = JSON.parse(
      await readFile(join(clineDir, "cline_mcp_settings.json"), "utf-8")
    ) as Record<string, unknown>;
    const entry = (content["mcpServers"] as Record<string, unknown>)["lumina-vault"] as Record<
      string,
      unknown
    >;
    expect(entry["disabled"]).toBe(false);
    expect(entry["autoApprove"]).toEqual([]);
  });
});

describe("runInstall", () => {
  it("exits with error for unknown target", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    await expect(runInstall(["unknown-tool"])).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("installs a single known target", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>) // which claude
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>); // install
    await runInstall(["claude"]);
    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
  });

  it("aborts when user declines confirmation", async () => {
    mockPrompt("n");
    await runInstall([]);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it("runs all targets when user confirms", async () => {
    mockPrompt("y");
    // which → not found for all CLI targets (simplest case: all skipped)
    mockSpawnSync.mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);
    await runInstall([]);
    // spawnSync is called once per CLI target (isCommandAvailable); file targets don't use it
    expect(mockSpawnSync).toHaveBeenCalledTimes(CLI_TARGETS.length);
  });

  it("runs all targets when user types 'yes'", async () => {
    mockPrompt("yes");
    mockSpawnSync.mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);
    await runInstall([]);
    expect(mockSpawnSync).toHaveBeenCalledTimes(CLI_TARGETS.length);
  });
});

describe("INSTALLER_TARGETS composition", () => {
  it("includes all expected targets", () => {
    const names = INSTALLER_TARGETS.map((t) => t.name);
    expect(names).toContain("cursor");
    expect(names).toContain("zed");
    expect(names).toContain("cline");
  });

  it("has 5 cli targets and 3 file targets", () => {
    expect(CLI_TARGETS).toHaveLength(5);
    expect(FILE_TARGETS).toHaveLength(3);
  });
});

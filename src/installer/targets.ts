import { join } from "path";

export type CliTarget = {
  readonly kind: "cli";
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
};

export type FileTarget = {
  readonly kind: "file";
  readonly name: string;
  readonly configPath: (homeDir: string) => string;
  readonly presenceDir?: (homeDir: string) => string;
  readonly mergeConfig: (existing: Record<string, unknown>) => Record<string, unknown>;
};

export type InstallerTarget = CliTarget | FileTarget;

const LUMINA_VAULT_ENTRY = { command: "npx", args: ["-y", "lumina-vault"] };

// Safely coerce an unknown value to a plain object, returning {} for non-objects.
function asObject(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

// %APPDATA% is always set on modern Windows; fallback reconstructs the conventional path.
function windowsAppData(homeDir: string): string {
  return process.env["APPDATA"] ?? join(homeDir, "AppData", "Roaming");
}

function zedConfigPath(homeDir: string): string {
  if (process.platform === "win32") {
    return join(windowsAppData(homeDir), "Zed", "settings.json");
  }
  if (process.platform === "darwin") {
    return join(homeDir, "Library", "Application Support", "Zed", "settings.json");
  }
  return join(homeDir, ".config", "zed", "settings.json");
}

function antigravityConfigPath(homeDir: string): string {
  return join(homeDir, ".gemini", "antigravity", "mcp_config.json");
}

function clineConfigPath(homeDir: string): string {
  // Only covers VS Code installed via .deb/.rpm on Linux.
  // Snap, Flatpak, and VSCodium use different config directories.
  const suffix = join(
    "Code",
    "User",
    "globalStorage",
    "saoudrizwan.claude-dev",
    "settings",
    "cline_mcp_settings.json"
  );
  if (process.platform === "win32") {
    return join(windowsAppData(homeDir), suffix);
  }
  if (process.platform === "darwin") {
    return join(homeDir, "Library", "Application Support", suffix);
  }
  return join(homeDir, ".config", suffix);
}

export const INSTALLER_TARGETS: readonly InstallerTarget[] = [
  {
    kind: "cli",
    name: "claude",
    command: "claude",
    args: ["mcp", "add", "lumina-vault", "npx", "--", "-y", "lumina-vault"],
  },
  {
    kind: "file",
    name: "antigravity",
    configPath: antigravityConfigPath,
    // Antigravity CLI creates ~/.gemini/ on install but only creates the
    // antigravity/ subdirectory on first MCP use. Check the parent level.
    presenceDir: (homeDir) => join(homeDir, ".gemini"),
    mergeConfig: (existing) => ({
      ...existing,
      mcpServers: {
        ...asObject(existing["mcpServers"]),
        "lumina-vault": LUMINA_VAULT_ENTRY,
      },
    }),
  },
  {
    kind: "cli",
    name: "codex",
    command: "codex",
    args: ["mcp", "add", "lumina-vault", "--", "npx", "-y", "lumina-vault"],
  },
  {
    kind: "cli",
    name: "opencode",
    command: "opencode",
    args: ["mcp", "add", "lumina-vault", "npx", "--", "-y", "lumina-vault"],
  },
  {
    kind: "cli",
    name: "windsurf",
    command: "windsurf",
    args: ["mcp", "add", "lumina-vault", "npx", "--", "-y", "lumina-vault"],
  },
  {
    kind: "file",
    name: "cursor",
    configPath: (homeDir) => join(homeDir, ".cursor", "mcp.json"),
    mergeConfig: (existing) => ({
      ...existing,
      mcpServers: {
        ...asObject(existing["mcpServers"]),
        "lumina-vault": LUMINA_VAULT_ENTRY,
      },
    }),
  },
  {
    kind: "file",
    name: "zed",
    configPath: zedConfigPath,
    mergeConfig: (existing) => ({
      ...existing,
      context_servers: {
        ...asObject(existing["context_servers"]),
        "lumina-vault": {
          command: { path: "npx", args: ["-y", "lumina-vault"] },
          settings: {},
        },
      },
    }),
  },
  {
    kind: "file",
    name: "cline",
    configPath: clineConfigPath,
    mergeConfig: (existing) => ({
      ...existing,
      mcpServers: {
        ...asObject(existing["mcpServers"]),
        "lumina-vault": { ...LUMINA_VAULT_ENTRY, disabled: false, autoApprove: [] },
      },
    }),
  },
] as const;

export const TARGET_NAMES = INSTALLER_TARGETS.map((t) => t.name);

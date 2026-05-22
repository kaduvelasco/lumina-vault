# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.2] - 2026-05-22

### Fixed

- `archive_memory`: active file is now restored to its template (`# Progress` / `# Decisions`) when all dated entries are archived and no undated content remains, preventing a permanently empty file.
- Installer `antigravity` target: presence check now tests `~/.gemini/` (Gemini CLI root) instead of `~/.gemini/antigravity/`, allowing installation on fresh Antigravity setups where the MCP config subdirectory has not yet been created by the tool.
- `init_project_memory` auto-detection (`auto_detect: true`): README parser no longer picks up linked badges (`[![...](img)](url)`), HTML elements, blockquotes, table rows, or lines starting with non-ASCII characters (e.g. emoji) as the project description.
- `search_memory`: result file list is now sorted alphabetically within each scope, ensuring stable pagination across multiple calls.

### Changed

- Internal `atomicWrite` logic extracted to a shared utility (`src/utils/atomicWrite.ts`), eliminating three identical implementations across `vault.ts`, `config.ts`, and the installer.
- `FileTarget` type extended with an optional `presenceDir` field, allowing each file-based installer target to declare which directory signals tool presence independently of the config file path.
- `analyzeProject` (used by `init_project_memory` with `auto_detect: true`): `detectInfrastructure` and `detectComponents` now run in parallel, reducing auto-detection latency.

## [1.0.1] - 2026-05-21

### Added

- Logo image added to the top of `README.md` and `LEIAME.md`.
- New installer target: `antigravity` (Antigravity CLI), replacing `gemini`.

### Changed

- Installer: `gemini` target (CLI-based, `gemini` binary) replaced by `antigravity` (file-based, `~/.gemini/antigravity/mcp_config.json`).
- Manual configuration docs updated to reference `~/.gemini/antigravity/mcp_config.json`.

### Removed

- `GEMINI.md` session context file — Antigravity CLI uses `AGENTS.md` instead.

## [1.0.0] - 2026-05-19

### Added

- Initial public release.

---

Made with ❤️ and AI by [Kadu Velasco](https://github.com/kaduvelasco)

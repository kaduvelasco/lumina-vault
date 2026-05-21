# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

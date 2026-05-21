# Antigravity CLI — Migration Reference

Information gathered to migrate from Gemini CLI to Antigravity CLI in this project.

---

## Context

Google announced the transition from Gemini CLI to Antigravity CLI at Google I/O 2026 (May 19, 2026).

- **Deadline:** June 18, 2026 — the `gemini` binary stops serving requests for all account types.
- **Announcement:** [An important update: Transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)

---

## Antigravity CLI

| Property | Value |
|---|---|
| Binary | `agy` |
| Language | Go |
| Config file (Linux/macOS) | `~/.gemini/antigravity/mcp_config.json` |
| Config file (Windows) | `%USERPROFILE%\.gemini\antigravity\mcp_config.json` |
| Install (Homebrew) | `brew install antigravity` |

---

## MCP Configuration Format

Antigravity CLI reads MCP server definitions from its global configuration file. The format uses the standard `mcpServers` block:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "package-name"],
      "env": {
        "ENV_VAR": "value"
      }
    }
  }
}
```

**Additional supported fields:**

| Field | Type | Description |
|---|---|---|
| `command` | string | Binary or interpreter to run |
| `args` | string[] | Arguments passed to the command |
| `env` | object | Environment variables injected into the process |
| `disabled` | boolean | Disables the server without removing the entry |
| `disabledTools` | string[] | Disables specific tools within the server |
| `serverUrl` | string | For HTTP-based servers (instead of `command`/`args`) |
| `headers` | object | HTTP headers for authentication (used with `serverUrl`) |

---

## Differences from Gemini CLI

| | Gemini CLI | Antigravity CLI |
|---|---|---|
| Binary | `gemini` | `agy` |
| Config file | `~/.gemini/settings.json` | `~/.gemini/antigravity/mcp_config.json` |
| MCP block | `mcpServers` | `mcpServers` (same) |
| Add via CLI | `gemini mcp add ...` | Config file only (no `agy mcp add`) |
| Session context file | `GEMINI.md` | — |

---

## Sources

- [An important update: Transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
- [How to Use MCP Servers in Antigravity (Setup Guide 2026)](https://agentpedia.codes/blog/antigravity-mcp-tutorial)
- [Antigravity CLI Deep Dive: Google's Go-Based Terminal Agent](https://agentpedia.codes/blog/antigravity-cli-deep-dive)
- [Getting Started with Antigravity CLI](https://dev.to/gde/getting-started-with-antigravity-cli-183g)
- [Migrate from Gemini CLI to Antigravity CLI: Complete Guide](https://www.aimadetools.com/blog/migrate-gemini-cli-to-antigravity-cli/)

---

Made with ❤️ and AI by [Kadu Velasco](https://github.com/kaduvelasco)

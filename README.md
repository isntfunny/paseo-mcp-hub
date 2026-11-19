# MCP Hub for Paseo

A [Paseo](https://github.com/getpaseo/paseo) plugin that manages all your external MCP servers in one central catalog (`~/.paseo/mcp-hub/servers.json`), injects them automatically into new agent sessions, and lets you manage and inspect everything directly inside Paseo.

## Features

- **Opt-out provider model (`excludeProviders`)** — works automatically across `claude`, `codex`, `agy`, `opencode`, `omp`, `copilot`, and custom providers (`pi` is excluded by default).
- **Native Settings GUI (EN & DE)** — configure `stdio`, `http`, and `sse` servers, environment variables/headers, directory scopes, and excluded providers under **Settings → Plugins → MCP Hub** without editing JSON by hand (with raw JSON recovery & advanced editor included).
- **Per-agent Composer Pill (`MCP N`)** — shows the active external MCP count right above each agent's composer and opens a popover listing active servers (including servers from other plugins like `shared-browser`), skipped catalog entries with reasons, and drift since session start.
- **Project & git worktree scoping** — scope servers globally (`true`), off (`false`), to specific directories (`enabled: [...]`), or exclude directories (`disabled: [...]`). Git worktrees automatically match their parent repository.
- **Zero-secret inspection** — `servers.json` is written atomically with `0600` permissions; agent metadata and the popover only ever expose key names and sanitized URLs without query tokens or credentials.

## Install

Requirements: Paseo `>= 0.16.0` with plugins enabled.

### From GitHub (recommended)

```sh
paseo plugin install github:isntfunny/paseo-mcp-hub
```

### From a local checkout

```sh
git clone https://github.com/isntfunny/paseo-mcp-hub ~/paseo-plugins/mcp-hub
paseo plugin install ~/paseo-plugins/mcp-hub
```

To open settings directly from anywhere in Paseo, run **⌘K / Ctrl+K → MCP Hub: Open settings**.

## Catalog (`servers.json`)

Default path: `~/.paseo/mcp-hub/servers.json` (override via `MCP_HUB_CATALOG` on the Paseo daemon).
The file is re-read on every agent creation, so edits take effect on the next new session without reloading the plugin. See [`servers.example.json`](servers.example.json).

| Field | Description |
| --- | --- |
| `excludeProviders` | Provider IDs skipped by MCP Hub (default `["pi"]`). All other providers receive matching servers. |
| `servers.<name>.type` | `stdio`, `http`, or `sse` |
| `servers.<name>.command` / `args` / `env` | Command, argument array, and environment variables for `stdio` servers |
| `servers.<name>.url` / `headers` | Endpoint URL and HTTP headers for `http` / `sse` servers |
| `servers.<name>.enabled` | `true`, `false`, or an array of directories (`~` expanded), default `true` |
| `servers.<name>.disabled` | Array of directories where the server is skipped even when `enabled` matches, default `[]` |

### Example

```json
{
  "excludeProviders": ["pi"],
  "servers": {
    "searxng": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-searxng"],
      "env": { "SEARXNG_URL": "https://search.example.com" },
      "disabled": ["~/code/offline-only"]
    },
    "project-api": {
      "enabled": ["~/code/my-project"],
      "type": "http",
      "url": "https://example.com/api/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

### Precedence & limits

- Servers passed explicitly on `agent.create` win over catalog entries with the same name.
- `disabled` wins over `enabled`.
- Server name `paseo` is reserved by Paseo and cannot be added to the catalog.
- Running sessions keep the servers they launched with; changes apply to newly created sessions.
- A malformed catalog file is logged and skipped so it never blocks agent creation.

### Migrating from v0.1 (`providers` allowlist)

Earlier versions used `"providers": ["claude", "codex"]` as an allowlist. That field is now ignored in favor of `"excludeProviders"` (default `["pi"]`). Existing `servers.json` files continue working immediately without manual edits; saving once in the Settings UI updates the file to `excludeProviders`.

## Security

`servers.json` typically stores API tokens and credentials:

- The server keeps file permissions at `0600` on every write.
- Environment variable values, header values, and URL query strings/credentials are stripped before writing agent metadata or returning session status to the client popover.

## Development

```sh
npm install
npm run typecheck
npm test
paseo plugin reload mcp-hub
```

## License

MIT

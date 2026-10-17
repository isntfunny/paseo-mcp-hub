# mcp-hub

A [Paseo](https://github.com/getpaseo/paseo) plugin that keeps all MCP servers in
one central catalog and injects them into new agent sessions, instead of
maintaining them separately in `~/.claude.json`, `~/.codex/config.toml`, etc.

It hooks `agent.create`, reads the catalog and sets the agent's `mcpServers`.
The catalog is re-read on every agent creation, so edits apply to the next new
session without reloading the plugin. Running sessions are not changed (Paseo
only sets MCP servers when an agent is created).

## Install

```sh
git clone https://github.com/isntfunny/paseo-mcp-hub ~/paseo-plugins/mcp-hub
cd ~/paseo-plugins/mcp-hub && npm install
```

Then add it to `~/.paseo/config.json` (plugins must be enabled):

```json
{
  "pluginsEnabled": true,
  "plugins": {
    "mcp-hub": { "source": "directory", "path": "/home/you/paseo-plugins/mcp-hub", "enabled": true }
  }
}
```

## Catalog

Default location: `~/.paseo/mcp-hub/servers.json` (override with the
`MCP_HUB_CATALOG` environment variable of the Paseo daemon). It usually contains
secrets, so `chmod 600` it. See [`servers.example.json`](servers.example.json).

| Field | Description |
| --- | --- |
| `providers` | Providers that receive the servers (default `["claude", "codex"]`). Others are left untouched. |
| `servers.<name>.type` | `stdio`, `http` or `sse` |
| `servers.<name>.command` / `args` / `env` | for `stdio` servers |
| `servers.<name>.url` / `headers` | for `http` / `sse` servers |
| `servers.<name>.enabled` | see below, default `true` |

### `enabled`

- `true` / `false`: the server is on or off for every new session.
- An array of directories: the server is only added when the agent's working
  directory is one of them or lies below one of them. `~` is expanded.
  Git worktrees (such as Paseo's `~/.paseo/worktrees/...`) count as the
  repository they belong to, so a project path also matches its worktrees.

```json
"project-api": {
  "enabled": ["~/code/my-project"],
  "type": "http",
  "url": "https://example.com/api/mcp"
}
```

Servers passed explicitly in the agent create request win over catalog entries
with the same name. A broken catalog is logged and ignored; it never blocks
agent creation.

## License

MIT

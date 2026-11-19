MCP Hub manages external MCP servers in one central catalog and attaches matching servers to new Paseo agent sessions. Instead of configuring servers separately per provider CLI, you maintain a single catalog with directory scoping and provider exclusions, edit it from Paseo settings, and inspect active servers directly from each agent composer.

## How it works

When a non-internal agent is created, MCP Hub reads the catalog file from disk, checks whether the agent provider is excluded, and matches each server against the agent working directory. When a working directory belongs to a git worktree (such as a Paseo worktree), MCP Hub also matches rules against the main repository directory. Matching `stdio`, `http`, and `sse` servers are added to the new agent configuration, while servers already passed explicitly by the caller keep precedence.

Each agent also receives a composer pill (`MCP`) that displays the number of active external MCP servers attached to that session. Opening the pill lists active servers (from MCP Hub and other sources), any catalog servers skipped for that session with the reason, and whether the catalog changed since the session started.

## Setup

MCP Hub requires Paseo 0.16.0 or newer. It reads and writes the catalog at `~/.paseo/mcp-hub/servers.json` on the daemon host (or the path set in `MCP_HUB_CATALOG`). No manual configuration file is required upfront: opening **Settings -> Plugins -> MCP Hub** creates the catalog on first save.

## Settings and capabilities

The plugin adds two settings tabs localized in English and German following your Paseo app language:

- **Servers**: Lists configured servers with quick toggles for globally enabled entries, a form editor for adding, editing, renaming, or deleting `stdio`, `http`, and `sse` entries, directory allow/exclude rules (`enabled` and `disabled`), and inline raw JSON recovery if the file contains syntax or schema errors.
- **Providers**: Lists configured Paseo providers from the daemon so you can toggle `excludeProviders` using an opt-out model (`pi` is excluded by default because standard Pi setups reject external MCP servers unless the MCP extension is enabled). Includes an input for custom provider IDs and an advanced raw JSON editor.

## Data handling and limits

- Catalog saves use atomic file writes with `0600` file permissions so environment variables and HTTP headers stay private on disk.
- Agent session metadata and the composer popover store only server names, transport types, command summaries or sanitized URLs (without credentials or query parameters), and environment/header key names. Secret values are never written to agent metadata or sent to the popover.
- Catalog edits apply immediately to the next newly created agent. Running sessions keep the MCP servers they started with.
- An invalid catalog file is logged on the daemon and skipped so it never blocks agent creation.
- The server name `paseo` is reserved by Paseo and cannot be used in the catalog.

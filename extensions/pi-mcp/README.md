# pi-mcp

Connects Pi to MCP servers. Provides an `mcp` tool for discovering and calling server tools, with an option to expose selected server tools directly in Pi.

> **Restart Pi after any configuration or project-trust change.**

## Configure Servers

| Scope | File |
|---|---|
| All projects | `~/.pi/agent/.mcp.json` |
| This project only | `.mcp.json` in the project root (project must be trusted) |

The files use [Claude Code's `.mcp.json` format](https://docs.anthropic.com/en/docs/claude-code/mcp). When a project is trusted, its servers are merged with the global list; a project entry with the same name replaces the global one. Use `/trust` to trust a project.

If no servers load successfully, the `mcp` tool is not registered (no context cost).

### Stdio Server

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"]
    }
  }
}
```

With a secret injected from the environment:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "my-mcp-server",
      "env": { "API_KEY": "${MY_API_KEY}" }
    }
  }
}
```

### HTTP Server

```json
{
  "mcpServers": {
    "example": {
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ${SERVICE_API_KEY}" }
    }
  }
}
```

### Secrets (`${NAME}`)

Use `${NAME}` in `headers` and stdio `env` values to reference environment variables from Pi's process. Start Pi with the variable set; do not put tokens in `.mcp.json`. If a referenced variable is unset, Pi skips that server with a warning.

## Use the `mcp` Tool

`mcp` has two actions:

| Action | What it does |
|---|---|
| `describe` | Lists all tools on a server with their schemas |
| `call` | Invokes a tool by name with arguments |

Workflow: `describe` a server first when its tools are unfamiliar, then `call` with the correct arguments.

## Direct Tools

By default all server tools are reached through `mcp`. To register a server's tools directly in Pi (so Pi can call them without going through `mcp`), add a `direct` key:

```json
{
  "mcpServers": {
    "search-server": {
      "url": "https://search.example.com/mcp",
      "direct": ["search", "get_item"]
    },
    "utility-server": {
      "command": "utility-mcp",
      "direct": true
    }
  }
}
```

Use an explicit list (`["tool-a", "tool-b"]`) rather than `true` (which promotes all tools) where possible; direct tool names share a namespace with Pi's built-in tools, so `true` risks collisions.

## OAuth (Remote Servers)

If an HTTP server requires OAuth, Pi displays an authorization URL when it first connects. Open the URL in a browser, complete the flow, and return to Pi. Credentials are stored in `~/.pi/agent/.mcp.auth.json` keyed by server URL.

To force re-authorization for a server, delete that server's entry from `.mcp.auth.json` and `/reload` Pi. The next connection attempt will prompt again.

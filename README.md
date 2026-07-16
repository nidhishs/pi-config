# pi-config

Personal pi configuration and extension packages.

## Install

```sh
./install.sh
```

Select the extensions and skills you want; they're symlinked into `~/.pi/agent`. Re-running is safe and only touches links it created.

## Extensions

Extensions live under `extensions/`. Each extension is an independently installable pi package with its own `package.json`, lockfile, dependencies, source, and tests.

Current extensions:

- `extensions/pi-dispatch`: adds the `dispatch` tool for delegating tasks to subagents.
- `extensions/pi-mcp`: connects Pi to MCP servers lazily (`describe` -> `call`).

## Shared Utilities

- `extensions/pi-shared-utils`: reusable utilities shared by the extensions. It is not itself a Pi extension.

## Development

Install dependencies for all packages:

```sh
npm run setup
```

Typecheck all packages:

```sh
npm run check
```

The root package is only a developer harness. Dependencies remain isolated inside each extension and utility package.

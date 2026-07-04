# pi-config

Personal pi configuration and extension packages.

## Extensions

Extensions live under `extensions/`. Each extension is an independently installable pi package with its own `package.json`, lockfile, dependencies, source, and tests.

Current extensions:

- `extensions/pi-dispatch`: adds the `dispatch` tool for running delegated subagent tasks.

## Development

Install dependencies for all extensions:

```sh
npm run setup
```

Typecheck all extensions:

```sh
npm run check
```

Run all extension tests:

```sh
npm test
```

The root package is only a developer harness. Dependencies remain isolated inside each extension package.

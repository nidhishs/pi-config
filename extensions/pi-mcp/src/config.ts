import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT_MCP_PATH = join(getAgentDir(), ".mcp.json");

type NotificationType = "info" | "warning" | "error";
export let notify: (message: string, type?: NotificationType) => void = () => {};
export function setNotify(fn: typeof notify): void {
  notify = fn;
}

interface CommonConfig {
  name: string;
  description?: string;
  direct?: string[] | true; // tool names to promote as native pi tools; true = all
}

export type ServerConfig =
  | (CommonConfig & { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> })
  | (CommonConfig & { type: "http"; url: string; headers?: Record<string, string> });

export function loadConfig(cwd: string, trustProject: boolean): ServerConfig[] {
  const paths = [AGENT_MCP_PATH, ...(trustProject ? [join(cwd, ".mcp.json")] : [])];
  const configured = new Map<string, { path: string; config: Record<string, any> }>();

  for (const path of paths) {
    if (!existsSync(path)) continue;
    const raw = JSON.parse(readFileSync(path, "utf8")) as { mcpServers?: Record<string, Record<string, any>> };
    for (const [name, config] of Object.entries(raw.mcpServers ?? {})) configured.set(name, { path, config });
  }

  const servers: ServerConfig[] = [];
  for (const [name, { path, config }] of configured) {
    try {
      servers.push(parseServer(name, config));
    } catch (err) {
      notify(`[pi-mcp] ${path}: skipping server "${name}": ${err}`, "warning");
    }
  }
  return servers;
}

function parseServer(name: string, config: Record<string, any>): ServerConfig {
  const common = { name, description: config.description, direct: config.direct };
  if (typeof config.command === "string")
    return { ...common, type: "stdio", command: config.command, args: config.args, env: interpolate(config.env) };
  if (typeof config.url === "string")
    return { ...common, type: "http", url: config.url, headers: interpolate(config.headers) };
  throw new Error("needs `command` (stdio) or `url` (http)");
}

function interpolate(values?: Record<string, string>): Record<string, string> | undefined {
  if (!values) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    result[key] = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name) => {
      const resolved = process.env[name];
      if (resolved === undefined) throw new Error(`environment variable "${name}" is not set`);
      return resolved;
    });
  }
  return result;
}

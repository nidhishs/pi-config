import { type AgentToolResult, type ExtensionAPI, type Theme, type ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { type ImageContent, StringEnum } from "@earendil-works/pi-ai";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createPromptLoader } from "pi-shared-utils/prompting";
import { expandHint, formatToolResultText, runTextToolResult } from "pi-shared-utils/tool-results";
import { type Static, type TSchema, Type } from "typebox";
import { getClient } from "./client.ts";
import { notify, type ServerConfig } from "./config.ts";

const prompts = createPromptLoader(import.meta.url);
const renderPromptGuidelines = (servers: ServerConfig[]) => prompts.renderList("tool-prompt-guidelines", {
  servers: servers.map(({ name, description }) => `  - \`${name}\`${description ? `: ${description}` : ""}`
  ).join("\n"),
});
const TOOL_DESCRIPTION = prompts.render("tool-description");
const PROMPT_SNIPPET = prompts.render("tool-prompt-snippet");
const MAX_CALL_WIDTH = 80;

const toolParameters = Type.Object({
  action: StringEnum(["describe", "call"] as const, { description: "Action to perform." }),
  server: Type.Optional(Type.String({ description: "Configured server. Required for `describe` and `call`." })),
  tool: Type.Optional(Type.String({ description: "Tool from `describe`. Required for `call`." })),
  args: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Arguments matching the tool schema." })),
});
type ToolParameters = Static<typeof toolParameters>;

function renderCallLine(title: string, params: Record<string, unknown> | undefined, theme: Theme): Text {
  if (!params || Object.keys(params).length === 0) return new Text(title, 0, 0);

  const args = JSON.stringify(params);
  const available = Math.max(0, MAX_CALL_WIDTH - visibleWidth(title) - "()".length);
  const omitted = `...${args.at(-1) ?? ""}`;
  const shown = args.length > available
    ? `${args.slice(0, Math.max(0, available - omitted.length))}${omitted}` : args;
  return new Text(title + theme.fg("muted", `(${shown})`), 0, 0);
}

function renderMcpCall(params: Partial<ToolParameters>, theme: Theme): Text {
  const target = params.action === "call" ? [params.server, params.tool].filter(Boolean).join(".") : params.server;
  const title = [
    theme.fg("toolTitle", theme.bold("mcp")),
    params.action && theme.fg("accent", params.action),
    target && theme.fg("muted", target),
  ].filter(Boolean).join(" ");
  return renderCallLine(title, params.action === "call" ? params.args : undefined, theme);
}

function renderDirectCall(toolName: string, params: Record<string, unknown>, theme: Theme): Text {
  return renderCallLine(theme.fg("toolTitle", theme.bold(toolName)), params, theme);
}

function renderMcpResult(result: AgentToolResult<undefined>, options: ToolRenderResultOptions, theme: Theme): Text {
  const lines = result.content.flatMap((content) => content.type === "text" ? content.text.split("\n") : []);
  if (lines.length === 0) return new Text("", 0, 0);
  if (options.expanded) {
    return new Text(lines.map((line) => theme.fg("toolOutput", line)).join("\n"), 0, 0);
  }
  return new Text(
    theme.fg("muted", "⎿  ") + theme.fg("syntaxNumber", `~${lines.length} lines`) + expandHint(theme),
    0, 0,
  );
}

export function registerProxyTool(pi: ExtensionAPI, servers: ServerConfig[]): void {
  pi.registerTool({
    name: "mcp",
    label: "mcp",
    description: TOOL_DESCRIPTION,
    promptSnippet: PROMPT_SNIPPET,
    promptGuidelines: renderPromptGuidelines(servers),
    parameters: toolParameters,
    renderCall: renderMcpCall,
    renderResult: renderMcpResult,
    execute: (_id, params, signal) => runProxyTool(servers, params, signal),
  });
}

export async function registerDirectTools(pi: ExtensionAPI, servers: ServerConfig[]): Promise<void> {
  for (const cfg of servers) {
    const direct = cfg.direct;
    if (!direct) continue;
    try {
      const { tools } = await (await getClient(cfg)).listTools();
      const selected = Array.isArray(direct) ? tools.filter((tool) => direct.includes(tool.name)) : tools;
      for (const tool of selected) {
        const description = tool.description ?? `${tool.name} on ${cfg.name}`;
        pi.registerTool({
          name: tool.name,
          label: tool.name,
          description,
          promptSnippet: description,
          parameters: { properties: {}, ...tool.inputSchema } as unknown as TSchema,
          renderResult: renderMcpResult,
          renderCall: (params, theme) => renderDirectCall(tool.name, params as Record<string, unknown>, theme),
          execute: (_id, params, signal) => runMcpTool(cfg, tool.name, params as Record<string, unknown>, signal),
        });
      }
    } catch (err) {
      notify(`[pi-mcp] Failed to load direct tools from "${cfg.name}": ${err}`, "warning");
    }
  }
}

async function runProxyTool(
  servers: ServerConfig[],
  params: ToolParameters,
  signal?: AbortSignal,
): Promise<AgentToolResult<undefined>> {
  if (params.action === "describe") {
    return runTextToolResult(async () => {
      const server = resolveServer(servers, params.server);
      const { tools } = await (await getClient(server)).listTools();
      return tools.map((tool) =>
        `## ${tool.name}\n${tool.description ?? ""}\nInput schema: ${JSON.stringify(tool.inputSchema)}`
      ).join("\n\n") || "(no tools found)";
    });
  }
  if (params.action === "call") {
    if (!params.tool) throw new Error(`Missing required field: \`tool\``);
    return runMcpTool(resolveServer(servers, params.server), params.tool, params.args ?? {}, signal);
  }

  throw new Error(`Unknown action: ${String(params.action)}`);
}

async function runMcpTool(cfg: ServerConfig, tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<AgentToolResult<undefined>> {
  const result = await (await getClient(cfg)).callTool({ name: tool, arguments: args }, undefined, { signal }) as CallToolResult;

  const text: string[] = [];
  const images: ImageContent[] = [];
  for (const content of result.content) {
    if (content.type === "text") text.push(content.text);
    else if (content.type === "image") images.push({ type: "image", data: content.data, mimeType: content.mimeType });
    else text.push(`[${content.type} content omitted]`);
  }
  let output = text.join("\n") || JSON.stringify(result.structuredContent);
  if (result.isError) throw new Error(output || `Tool ${tool} failed`);
  if (!output && !images.length) output = "(no output)";
  return { content: [...(output ? [{ type: "text" as const, text: formatToolResultText(output, "success") }] : []), ...images], details: undefined };
}

function resolveServer(servers: ServerConfig[], name?: string): ServerConfig {
  if (!name) throw new Error(`Missing required field: \`server\``);
  const server = servers.find((candidate) => candidate.name === name);
  if (!server) throw new Error(`Unknown configured server "${name}". Configured servers: ${servers.map((server) => server.name).join(", ")}.`);
  return server;
}

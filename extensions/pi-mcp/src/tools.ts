import { keyHint, type AgentToolResult, type ExtensionAPI, type Theme, type ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { type ImageContent, StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createPromptLoader } from "pi-shared-utils/prompting";
import { formatToolResultText, runTextToolResult } from "pi-shared-utils/tool-results";
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

const toolParameters = Type.Object({
  action: StringEnum(["describe", "call"] as const, { description: "Action to perform." }),
  server: Type.Optional(Type.String({ description: "Configured server. Required for `describe` and `call`." })),
  tool: Type.Optional(Type.String({ description: "Tool from `describe`. Required for `call`." })),
  args: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Arguments matching the tool schema." })),
});
type ToolParameters = Static<typeof toolParameters>;

function renderProxyCall(params: Partial<ToolParameters>, theme: Theme): Text {
  const target = params.action === "call" ? [params.server, params.tool].filter(Boolean).join(".") : params.server;
  return new Text([
    theme.fg("toolTitle", theme.bold("mcp")),
    params.action && theme.fg("accent", params.action),
    target && theme.fg("muted", target),
  ].filter(Boolean).join(" "), 0, 0);
}

function renderMcpResult(result: AgentToolResult<undefined>, options: ToolRenderResultOptions, theme: Theme): Text {
  const lines = result.content.flatMap((content) => content.type === "text" ? content.text.split("\n") : []);
  const shown = options.expanded ? lines : lines.slice(0, 10);
  const remaining = lines.length - shown.length;
  let text = `\n${shown.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
  if (remaining > 0) {
    text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")}${theme.fg("muted", ")")}`;
  }
  return new Text(text, 0, 0);
}

export function registerProxyTool(pi: ExtensionAPI, servers: ServerConfig[]): void {
  pi.registerTool({
    name: "mcp",
    label: "mcp",
    description: TOOL_DESCRIPTION,
    promptSnippet: PROMPT_SNIPPET,
    promptGuidelines: renderPromptGuidelines(servers),
    parameters: toolParameters,
    renderCall: renderProxyCall,
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

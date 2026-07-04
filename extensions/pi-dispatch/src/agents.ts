// loads subagent defs from disk and resolves a name to launch coordinates

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, parseFrontmatter, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { THINKING_LEVELS, type SubagentDef, type SubagentLaunch } from "./types.ts";

const AGENTS_DIR = join(getAgentDir(), "dispatch", "agents");
const AGENT_DEFS = loadSubagentDefs();

// "name (description)" list the parent model sees, interpolated into the tool prompts
export const AGENT_LIST = Object.entries(AGENT_DEFS).map(([name, a]) => `${name} (${a.description})`).join(", ") || "none";

// parse + validate one file; parseFrontmatter guarantees nothing about field shapes
function parseSubagentDef(name: string, raw: string): SubagentDef {
  const { frontmatter, body } = parseFrontmatter<Partial<SubagentDef>>(raw);
  if (frontmatter.thinking !== undefined && !THINKING_LEVELS.includes(frontmatter.thinking))
    throw new Error(`thinking must be one of ${THINKING_LEVELS.join("/")}, got "${frontmatter.thinking}"`);
  if (frontmatter.tools !== undefined && !Array.isArray(frontmatter.tools))
    throw new Error("tools must be a YAML list");
  return {
    description: frontmatter.description ?? name,
    model: frontmatter.model,
    tools: frontmatter.tools,
    thinking: frontmatter.thinking,
    systemPrompt: body.trim(),
  };
}

// one bad file skips with a warning
function loadSubagentDefs(): Record<string, SubagentDef> {
  const defs: Record<string, SubagentDef> = {};
  let files: string[] = [];
  try { files = readdirSync(AGENTS_DIR); } catch { /* agents are optional */ }

  for (const file of files.filter((f) => f.endsWith(".md"))) {
    const name = file.slice(0, -".md".length);
    try {
      defs[name] = parseSubagentDef(name, readFileSync(join(AGENTS_DIR, file), "utf8"));
    } catch (err) {
      console.warn(`[pi-dispatch] skipping agent ${file}: ${String(err)}`);
    }
  }
  return defs;
}

export function resolveSubagent(name: string | undefined, ctx: ExtensionContext): SubagentLaunch {
  const def = name === undefined ? undefined : AGENT_DEFS[name]; // no def = inherit parent model, no role
  if (name !== undefined && !def) throw new Error(`unknown agent "${name}"; available: ${AGENT_LIST}`);
  const model = def?.model
    ? ctx.modelRegistry.getAvailable().find((m) => `${m.provider}/${m.id}` === def.model)
    : ctx.model;
  if (def?.model && !model) throw new Error(`agent "${name}": model "${def.model}" not available.`);
  if (!model) throw new Error("dispatch: no active model to inherit for subagents.");
  return { model, thinkingLevel: def?.thinking, tools: def?.tools, systemPrompt: def?.systemPrompt };
}

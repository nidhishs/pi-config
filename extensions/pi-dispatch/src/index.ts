// wires the dispatch tool + /dispatch command: prompt loading, spawn binding, interactive-vs-blocking delivery

import { getAgentDir, type AgentToolResult, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Type } from "typebox";
import { AGENT_LIST, resolveSubagent } from "./agents.ts";
import { renderPrompt } from "./prompting.ts";
import { spawnSubagent } from "./spawn.ts";
import { listSubagents, runDispatchCode, type DispatchCtx, type Subagents } from "./runtime.ts";
import { DispatchWidget, renderDispatchCall, renderDispatchCompletion, renderDispatchResult } from "./ui.ts";
import type { DispatchResult } from "./types.ts";

const prompt = (name: string) => new URL(`./prompts/${name}.md`, import.meta.url);
const promptVars = { agents: AGENT_LIST };

const TOOL_DESCRIPTION = renderPrompt(prompt("tool-description"), promptVars);
const PROMPT_SNIPPET = renderPrompt(prompt("tool-prompt-snippet"), promptVars);
const PROMPT_GUIDELINES = renderPrompt(prompt("tool-prompt-guidelines"), promptVars)
  .split(/\r?\n/).map((line) => line.trim().replace(/^[-*+]\s+/, "")).filter(Boolean);
const TASK_PARAM = renderPrompt(prompt("tool-param-task-description"), promptVars);
const CODE_PARAM = renderPrompt(prompt("tool-param-code-description"), promptVars);

const DISPATCH_RESULT = "dispatch_result"; // customType for the background completion message

// one directory per dispatch; also interpolated into the tool result text below
const DISPATCH_ROOT = join(getAgentDir(), "dispatch", "sessions");
const dispatchDir = (dispatchId: string) => join(DISPATCH_ROOT, dispatchId);

function makeSpawn(ctx: ExtensionContext, dispatchId: string, signal: AbortSignal | undefined): DispatchCtx["spawn"] {
  return (prompt, agent, runId, onUpdate) =>
    spawnSubagent({
      ...resolveSubagent(agent, ctx), // sync throw BEFORE any async work -- keep first
      prompt, cwd: ctx.cwd,
      sessionPath: join(dispatchDir(dispatchId), `${agent ?? "agent"}-${runId.slice(0, 8)}.jsonl`),
      modelRegistry: ctx.modelRegistry,
      signal, onUpdate,
    });
}

export default function (pi: ExtensionAPI) {
  const subagents: Subagents = new Map();
  const widget = new DispatchWidget(subagents);

  pi.registerMessageRenderer(DISPATCH_RESULT, renderDispatchCompletion);
  pi.on("session_shutdown", () => {
    widget.dispose();
    for (const r of subagents.values()) if (!r.finishedAt) r.abort();
  });

  // interactive: background the body, deliver via steer message; non-interactive: block and return inline
  async function dispatch(
    ctx: ExtensionContext, task: string, code: string, signal: AbortSignal | undefined,
  ): Promise<AgentToolResult<DispatchResult>> {
    const dispatchId = randomUUID();
    const id = dispatchId.slice(0, 8);
    const transcriptDir = dispatchDir(dispatchId);
    const startedAt = Date.now();
    const interactive = ctx.mode === "tui";

    // interactive subagents outlive the turn, so they ignore its abort signal; blocking ones honor it
    const dctx: DispatchCtx = { dispatchId, subagents, spawn: makeSpawn(ctx, dispatchId, interactive ? undefined : signal) };
    const details = (finishedAt?: number): DispatchResult =>
      ({ dispatchId, task, code, startedAt, finishedAt, subagents: listSubagents(subagents, dispatchId) });
    const result = (text: string, finishedAt?: number): AgentToolResult<DispatchResult> =>
      ({ content: [{ type: "text" as const, text }], details: details(finishedAt) });
    const dispatchResult = (content: string) => renderPrompt(prompt("event-dispatch-result"), { id, content });

    if (!interactive) return result(dispatchResult(await runDispatchCode(code, dctx)), Date.now());

    widget.track(ctx.ui, dispatchId, task, startedAt);
    // fire-and-forget: runDispatchCode returns error text rather than rejecting
    void runDispatchCode(code, dctx).then((text) => {
      const finishedAt = Date.now();
      const snapshot = details(finishedAt); // capture before widget.finish() evicts subagents from the shared Map
      widget.finish(dispatchId, finishedAt);
      pi.sendMessage(
        { customType: DISPATCH_RESULT, content: dispatchResult(text), display: true, details: snapshot },
        { deliverAs: "steer", triggerTurn: true },
      );
    }).catch(() => {/* dispatch outlived the runtime (reload/shutdown): sendMessage throws, nothing to deliver to */});
    return result(renderPrompt(prompt("event-dispatch-started"), { id, task, transcriptDir }));
  }

  pi.registerTool({
    name: "dispatch",
    label: "dispatch",
    description: TOOL_DESCRIPTION,
    promptSnippet: PROMPT_SNIPPET,
    promptGuidelines: PROMPT_GUIDELINES,
    parameters: Type.Object({
      task: Type.String({ description: TASK_PARAM }),
      code: Type.String({ description: CODE_PARAM }),
    }),
    renderCall: renderDispatchCall,
    renderResult: renderDispatchResult,
    execute: (_toolCallId, { task, code }, signal, _onUpdate, ctx) => dispatch(ctx, task, code, signal),
  });

  pi.registerCommand("dispatch:cancel", {
    description: "Cancel specific background dispatches or subagents (/dispatch:cancel [id]).",
    handler: async (args: string, ctx) => {
      const target = args.trim();
      const victims = [...subagents.values()].filter(
        (r) => !r.finishedAt && (!target || r.dispatchId.startsWith(target) || r.id.startsWith(target)),
      );
      for (const r of victims) r.abort();
      const level = target && victims.length === 0 ? "warning" : "info";
      ctx.ui.notify(`dispatch: cancelled ${victims.length} running subagent(s)`, level);
    },
  });
}

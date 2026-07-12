// in-process subagent runner; shares the project's tools/extensions/skills (dispatch excluded)

import { dirname } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
  type CreateAgentSessionOptions,
} from "@earendil-works/pi-coding-agent";
import { formatToolResultText } from "pi-shared-utils/tool-results";
import { emptyUsage, type SubagentLaunch, type SubagentUpdate } from "./types.ts";

const AGENT_ROOT = getAgentDir();

// one spawn: what to run + the task + where + session plumbing
interface SpawnRequest extends SubagentLaunch {
  prompt: string;
  cwd: string;
  sessionPath: string; // on-disk transcript destination
  modelRegistry: NonNullable<CreateAgentSessionOptions["modelRegistry"]>;
  signal?: AbortSignal;
  onUpdate: (u: SubagentUpdate) => void;
}

export interface SpawnHandle {
  sessionPath: string;
  abort: (reason?: string) => void;
  finished: Promise<{ output?: string; error?: string }>;
}

function trackUsage(session: AgentSession, onUpdate: SpawnRequest["onUpdate"]): void {
  const usage = emptyUsage();
  const head = (s: string) => s.trim().slice(0, 80);
  session.subscribe((ev: AgentSessionEvent) => {
    if (ev.type === "tool_execution_start")
      return onUpdate({ activity: head(`${ev.toolName}(${JSON.stringify(ev.args) ?? ""})`) });
    if (ev.type === "message_update" && ev.message.role === "assistant") {
      const text = session.getLastAssistantText();
      if (text) onUpdate({ activity: head(text) });
      return;
    }
    if (ev.type !== "message_end" || ev.message.role !== "assistant") return;
    usage.inputTokens += ev.message.usage.input;
    usage.outputTokens += ev.message.usage.output;
    usage.cost += ev.message.usage.cost.total;
    onUpdate({ usage: { ...usage } });
  });
}

async function buildSession(req: SpawnRequest): Promise<AgentSession> {
  const loader = new DefaultResourceLoader({
    cwd: req.cwd, agentDir: AGENT_ROOT,
    appendSystemPrompt: req.systemPrompt ? [req.systemPrompt] : [],
  });
  await loader.reload(); // custom loader isn't auto-reloaded.

  const sm = SessionManager.create(req.cwd, dirname(req.sessionPath));
  sm.setSessionFile(req.sessionPath);

  const { session } = await createAgentSession({
    cwd: req.cwd, agentDir: AGENT_ROOT,
    model: req.model, thinkingLevel: req.thinkingLevel, modelRegistry: req.modelRegistry,
    tools: req.tools,
    excludeTools: ["dispatch"], // anti-recursion
    resourceLoader: loader,
    sessionManager: sm,
  });
  return session;
}

export function spawnSubagent(req: SpawnRequest): SpawnHandle {
  let session: AgentSession | undefined;
  // Preserve the first cancellation reason, including aborts before session creation.
  let abortReason: string | undefined = req.signal?.aborted ? "Cancelled." : undefined;
  const abort = (reason = "Cancelled.") => {
    if (abortReason !== undefined) return;
    abortReason = reason;
    session?.abort();
  };
  const onSignalAbort = () => abort();
  req.signal?.addEventListener("abort", onSignalAbort, { once: true });

  async function run(): Promise<{ output?: string; error?: string }> {
    try {
      session = await buildSession(req);
      if (abortReason !== undefined) return { error: formatToolResultText(abortReason, "error") };

      trackUsage(session, req.onUpdate);
      await session.prompt(req.prompt);

      if (abortReason !== undefined) return { error: formatToolResultText(abortReason, "error") };
      const text = session.getLastAssistantText();
      return { output: text ? formatToolResultText(text, "success") : undefined };
    } catch (err) {
      return { error: formatToolResultText(abortReason ?? err, "error") };
    } finally {
      session?.dispose();
      session = undefined;
      req.signal?.removeEventListener("abort", onSignalAbort);
    }
  }

  return { sessionPath: req.sessionPath, abort, finished: run() };
}

// in-process subagent runner; shares the project's tools/extensions/skills (dispatch excluded)

import { dirname } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  formatSize,
  getAgentDir,
  SessionManager,
  truncateHead,
  truncateTail,
  type AgentSession,
  type AgentSessionEvent,
  type CreateAgentSessionOptions,
} from "@earendil-works/pi-coding-agent";
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
  abort: () => void;
  finished: Promise<{ output?: string; error?: string }>;
}

// success keeps the head, errors keep the tail (the actionable end of a stack).
export function capResultText(text: string, mode: "head" | "tail"): string {
  const t = mode === "tail" ? truncateTail(text) : truncateHead(text);
  if (!t.truncated) return text;
  return `${t.content}\n\n[Truncated: ${t.outputLines} lines shown (${formatSize(t.maxBytes)} limit)]`;
}

function trackUsage(session: AgentSession, onUpdate: SpawnRequest["onUpdate"]): void {
  const usage = emptyUsage();
  const head = (s: string) => s.trim().slice(0, 80);
  session.subscribe((ev: AgentSessionEvent) => {
    if (ev.type === "tool_execution_start")
      return onUpdate({ activity: head(`${ev.toolName}(${JSON.stringify(ev.args) ?? ""})`) });
    if (ev.type !== "message_end" || ev.message.role !== "assistant") return;
    usage.inputTokens += ev.message.usage.input;
    usage.outputTokens += ev.message.usage.output;
    usage.cost += ev.message.usage.cost.total;
    onUpdate({ usage: { ...usage }, activity: head(session.getLastAssistantText() ?? "") });
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
  // abort may arrive before the session exists; remember intent and apply on creation
  let abortRequested = req.signal?.aborted ?? false;
  const abort = () => { abortRequested = true; session?.abort(); };
  req.signal?.addEventListener("abort", abort, { once: true });

  async function run(): Promise<{ output?: string; error?: string }> {
    try {
      session = await buildSession(req);
      if (abortRequested) return { error: "aborted" };

      trackUsage(session, req.onUpdate);
      await session.prompt(req.prompt);

      if (abortRequested) return { error: "aborted" };
      const text = session.getLastAssistantText();
      return { output: text ? capResultText(text, "head") : undefined };
    } catch (err) {
      return { error: capResultText(String(err), "tail") };
    } finally {
      session?.dispose();
      session = undefined;
      req.signal?.removeEventListener("abort", abort);
    }
  }

  return { sessionPath: req.sessionPath, abort, finished: run() };
}

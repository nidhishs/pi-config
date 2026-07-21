// Shared contracts. *Result = serializable data; *Handle = Result + live control, never serialized.

import type { CreateAgentSessionOptions } from "@earendil-works/pi-coding-agent";

export interface SubagentUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export const emptyUsage = (): SubagentUsage => ({ inputTokens: 0, outputTokens: 0, cost: 0 });

// one agent def from ~/.pi/agent/dispatch/agents/*.md
export interface SubagentDef {
  description: string;    // shown to the parent model; falls back to the agent name
  model?: string;         // provider/model-id (e.g. anthropic/claude-opus-4-8); omit -> inherit parent
  tools?: string[];       // allowlist; omit -> inherit all (dispatch is always excluded)
  thinking?: (typeof THINKING_LEVELS)[number];
  systemPrompt: string;   // the parent model never sees it; passed directly to child
}

// mirrors SubagentDef but post-resolution: model is a resolved object, not the "provider/id" string.
export interface SubagentLaunch {
  model: NonNullable<CreateAgentSessionOptions["model"]>; // always resolved at the edge
  thinkingLevel?: CreateAgentSessionOptions["thinkingLevel"];
  tools?: CreateAgentSessionOptions["tools"]; // allowlist; absent = all tools
  systemPrompt?: string; // agent body, appended to the child's system prompt
}

// one launched subagent; status is derived: !finishedAt = running, error = failed, else completed
export interface SubagentResult {
  id: string;
  dispatchId: string;
  startedAt: number;
  finishedAt?: number;
  output?: string; // neither output nor error set = clean run with no text
  error?: string;
  usage: SubagentUsage;
  sessionPath: string;
}

export type SubagentUpdate = Partial<Pick<SubagentHandle, "usage" | "activity">>;

export interface SubagentHandle extends SubagentResult {
  activity?: string; // latest tool call / assistant text
  abort: (reason?: string) => void;
  done: Promise<SubagentResult>;
}

// one dispatch -- the tool-result details read by renderers
export interface DispatchResult {
  dispatchId: string;
  task: string;
  code: string;
  startedAt: number;
  finishedAt?: number;
  subagents: SubagentResult[];
}

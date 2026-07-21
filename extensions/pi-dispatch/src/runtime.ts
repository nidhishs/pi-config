// Executes model-authored orchestration code with the dp primitives in scope.

import { randomUUID } from "node:crypto";
import { formatToolResultText } from "pi-shared-utils/tool-results";
import type { SpawnHandle } from "./spawn.ts";
import { emptyUsage, type SubagentHandle, type SubagentResult, type SubagentUpdate } from "./types.ts";

export type Subagents = Map<string, SubagentHandle>; // session-global registry, keyed by runId

// per-dispatch orchestration context;
export interface DispatchCtx {
  dispatchId: string;
  subagents: Subagents;
  spawn: (prompt: string, agent: string | undefined, runId: string, onUpdate: (u: SubagentUpdate) => void) => SpawnHandle;
}

// live handles of one dispatch's subagents in spawn order (map preserves insertion); no clone -- ok on the 80ms render path
export const liveSubagents = (subagents: Subagents, dispatchId: string): SubagentHandle[] =>
  [...subagents.values()].filter((r) => r.dispatchId === dispatchId);

// serializable snapshots, control handles stripped -- for tool results / completion cards
export const listSubagents = (subagents: Subagents, dispatchId: string): SubagentResult[] =>
  liveSubagents(subagents, dispatchId).map(({ abort: _a, done: _d, activity: _activity, ...rest }) => rest);

export async function runDispatchCode(code: string, dctx: DispatchCtx): Promise<string> {
  const dp = {
    run: (prompt: string, agent?: string) => start(String(prompt), agent, dctx).id,
    // join's projection is what the model sees -- keep it minimal
    join: (id: string) => requireSubagent(id, dctx).done.then(({ id, output, error, sessionPath }) => ({ id, output, error, sessionPath })),
    cancel: (id: string) => { const r = requireSubagent(id, dctx); if (!r.finishedAt) r.abort(); },
  };
  try {
    const result = await new AsyncFunction("dp", code)(dp);
    const text = result === undefined
      ? listSubagents(dctx.subagents, dctx.dispatchId).map((r) => r.output).filter(Boolean).join("\n---\n")
      : result;
    return formatToolResultText(text, "success");
  } catch (err) {
    return formatToolResultText(err, "error");
  } finally {
    // orphans: a run the body never joined must not outlive the dispatch
    for (const r of dctx.subagents.values())
      if (r.dispatchId === dctx.dispatchId && !r.finishedAt) r.abort();
  }
}

function requireSubagent(id: string, dctx: DispatchCtx): SubagentHandle {
  const rec = dctx.subagents.get(id);
  if (!rec || rec.dispatchId !== dctx.dispatchId) throw new Error(`unknown subagent id in this dispatch: ${id}`);
  return rec;
}

// registers the live record and starts the subagent; status derives from the record
function start(prompt: string, agent: string | undefined, dctx: DispatchCtx): SubagentHandle {
  const id = randomUUID();
  let rec: SubagentHandle;

  const { sessionPath, abort, finished } = dctx.spawn(prompt, agent, id, (u) => { Object.assign(rec, u); });
  rec = {
    id, dispatchId: dctx.dispatchId, startedAt: Date.now(), usage: emptyUsage(), sessionPath, abort,
    done: finished.then((out) => Object.assign(rec, out, { finishedAt: Date.now() })),
  };
  dctx.subagents.set(id, rec);
  return rec;
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as
  new (...a: string[]) => (...a: unknown[]) => Promise<unknown>;

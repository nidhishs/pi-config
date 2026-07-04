dp.run(prompt, agent?) -> id (string)
  Start a subagent and return its id immediately. Pass the `id` to dp.join. `agent`: a named agent role from the available-agents list; omit to inherit the parent's model with no role prompt. Unknown agent throws, listing available ones.
  Subagents inherit the project's tools and extensions (read/bash/edit/write, web search, MCP, ...) but not dispatch itself, so they can't recurse.

dp.join(id) -> Promise<{id, output?, error?, sessionPath}>
  Resolves when the run finishes. A failed run has `error`. A successful run with empty text may have neither `output` nor `error` — don't assume exactly one is set. `sessionPath` is the on-disk transcript. Unknown id throws.

dp.cancel(id) -> void
  Stop a running subagent; no-op if already finished. Unknown id throws.

Contract: await dp.join(id) or call dp.cancel(id) for each spawned run before returning. Any run you don't is cancelled when your code returns, so join everything whose result you want.

Waiting: if the user asks before the result arrives, tell them it's still running.

Status: to check what a run is doing mid-flight, Read its transcript file (given in the tool result); it appears only after the subagent's first assistant message, so retry on ENOENT.

Patterns:
  Single:           return (await dp.join(dp.run("verify X", "explorer"))).output;
  Fan-out/Fan-in:   const ids = items.map(x => dp.run(x)); const results = await Promise.all(ids.map(dp.join));
  Sequential:       const a = await dp.join(dp.run(step1)); return (await dp.join(dp.run(a.output))).output;
  Race:             start all candidates first; map each dp.join(id) to reject when its result has `error`, then use Promise.any(...) and cancel the rest in `finally`.
  Loop:             critique/writer — loop dp.run/dp.join until a critique subagent approves the latest draft.
  Emergent Coord:   ask each subagent for a parseable output format so the parent can filter, split, or route results instead of re-reading prose.

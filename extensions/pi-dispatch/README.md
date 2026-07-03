# Pi Dispatch

`pi-dispatch` adds a `dispatch` tool to Pi for delegating self-contained work to child agents. It is useful when work can be parallelized, isolated, or would otherwise flood the parent agent's context.

## What It Provides

- A `dispatch` tool that runs model-authored JavaScript orchestration code.
- A small `dp` API for spawning, joining, and cancelling subagents.
- In-process child `AgentSession`s that inherit the current project context.
- Per-subagent transcript files grouped by dispatch id.
- TUI background execution with live progress and a completion message.
- Blocking execution outside the TUI.
- Optional named subagent roles loaded from disk.
- `/dispatch:cancel` for cancelling active dispatches.

## Runtime Behavior

In TUI mode, `dispatch` returns immediately with a dispatch id and transcript directory. The dispatch body continues in the background. When it finishes, Pi injects a completion message and can trigger the next turn.

Outside TUI mode, `dispatch` blocks until the orchestration code finishes and returns the result inline.

Subagents cannot use `dispatch` themselves, which prevents recursive fan-out.

## `dp` API

The orchestration code receives a single `dp` object:

```ts
dp.run(prompt: string, agent?: string): string
```

Starts a subagent and returns its id immediately.

```ts
dp.join(id: string): Promise<{
  id: string;
  output?: string;
  error?: string;
  sessionPath: string;
}>
```

Waits for a subagent to finish.

```ts
dp.cancel(id: string): void
```

Cancels a running subagent.

If the dispatch body exits with unjoined subagents, those orphaned subagents are aborted.

## Examples

Fan out and join all results:

```js
const ids = ["inspect runtime", "inspect UI", "inspect prompts"]
  .map((prompt) => dp.run(prompt));

const results = await Promise.all(ids.map((id) => dp.join(id)));
return results.map((r) => r.output ?? r.error ?? "").join("\n---\n");
```

Sequential handoff:

```js
const first = dp.run("Find the relevant files for the bug");
const findings = await dp.join(first);

const second = dp.run(`Use these findings to propose a fix:\n${findings.output ?? ""}`);
return (await dp.join(second)).output;
```

Race several approaches and cancel the rest:

```js
const ids = [
  dp.run("Try approach A"),
  dp.run("Try approach B"),
  dp.run("Try approach C"),
];

try {
  return await Promise.any(ids.map(async (id) => {
    const result = await dp.join(id);
    if (result.error) throw new Error(result.error);
    return result.output ?? "";
  }));
} finally {
  for (const id of ids) dp.cancel(id);
}
```

## Named Subagents

Named agents are optional. Define them as Markdown files under:

```text
~/.pi/agent/dispatch/agents/*.md
```

The filename without `.md` is the agent name passed to `dp.run(prompt, agent)`.

Example:

```md
---
description: Read-only code search with file:line findings
model: anthropic/claude-sonnet-4-0
tools:
  - read
  - bash
thinking: low
---
You are a read-only explorer. Search the codebase and report concise findings with file:line references. Do not modify files.
```

Supported frontmatter fields:

- `description`: shown to the parent model in the available agent list.
- `model`: optional `provider/model-id`; omitted agents inherit the parent model.
- `tools`: optional tool allowlist; omitted agents inherit all tools except `dispatch`.
- `thinking`: one of `off`, `minimal`, `low`, `medium`, `high`, `xhigh`.

The Markdown body is appended to the child agent's system prompt.

## Transcripts

Each dispatch gets a session directory under Pi's agent dir:

```text
~/.pi/agent/dispatch/sessions/<dispatchId>/
```

Each subagent writes a transcript file inside that directory. The dispatch result includes the transcript location so the parent agent can inspect it if needed.

## Cancellation

Cancel all active dispatches:

```text
/dispatch:cancel
```

Cancel one dispatch by id:

```text
/dispatch:cancel <dispatchId>
```

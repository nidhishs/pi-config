Async JavaScript body. Only `dp` is in scope.

```ts
dp.run(prompt: string, agent?: string): string
dp.join(id: string): Promise<{ id: string; output?: string; error?: string; sessionPath: string }>
dp.cancel(id: string): void
```

`dp.run(...)` starts a child and returns a scope-local id. Use `dp.join(id)` to wait for it or `dp.cancel(id)` to cancel it; both only accept ids returned by `dp.run(...)` in this same body. Join or cancel every child this body starts before returning, or it will be cancelled on exit. Do not sleep, poll, or read transcripts for progress.

Child prompts are self-contained: the child has not seen this conversation. Include the goal, relevant files/facts, and output shape. Choose format by use: JSON/structured data for comparing, merging, routing, or passing onward; focused findings with enough context/evidence when the parent will read it.

Start independent children before joining so they run in parallel:

```js
const ids = [
  dp.run("Inspect auth implementation. Return file:line findings."),
  dp.run("Inspect auth tests. Return file:line findings."),
];

const results = await Promise.all(ids.map((id) => dp.join(id)));
return results.map((r) => r.error ?? r.output ?? "").join("\n---\n");
```

Return what the parent should receive: a string or JSON-serializable value. If omitted, joined child outputs are concatenated in spawn order.

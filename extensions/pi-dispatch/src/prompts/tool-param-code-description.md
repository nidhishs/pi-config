Async JavaScript body. Only `dp` is in scope.

```ts
dp.run(prompt: string, agent?: string): string
dp.join(id: string): Promise<{ id: string; output?: string; error?: string; sessionPath: string }>
dp.cancel(id: string): void
```

`dp.run(...)` starts a child in this dispatch and returns its id. Join or cancel every id this body starts before returning, or that child is cancelled on exit. `dp.join(id)` is this body's wait mechanism; do not sleep, poll, or loop over transcripts for progress.

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

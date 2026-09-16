Async JavaScript body. Only `dp` is in scope.

```ts
dp.run(prompt: string, agent?: string): string
dp.join(id: string): Promise<{ id: string; output?: string; error?: string }>
dp.cancel(id: string): void
```

- `dp.run` starts a child and returns a scope-local `id`. You must `dp.join(id)` or `dp.cancel(id)` every child before returning; unfinished children are cancelled on exit.
- Each child starts with its own context window and no parent conversation history. Include all task-specific context in its prompt: goal, relevant facts, constraints, and expected output.
- Write each `dp.run(...)` prompt as a valid JavaScript string expression. In template literals, escape literal backslashes, backticks, and `${` sequences; interpolate only intentionally.

Example:

```js
const ids = [
  dp.run("Inspect auth implementation. Return file:line findings."),
  dp.run("Inspect auth tests. Return file:line findings."),
];

const results = await Promise.all(ids.map((id) => dp.join(id)));
if (results.some((r) => r.error)) return results;

const final = await dp.join(
  dp.run(`Summarize into one recommendation:\n${JSON.stringify(results)}`)
);
return final.error ?? final.output ?? "";
```

Return a string or JSON-serializable value for the parent. Without an explicit return, joined outputs are concatenated in spawn order.

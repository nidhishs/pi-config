import { readFileSync } from "node:fs";

const INTERPOLATION = /\{\{(?:(\w+):)?([\w.-]+)\}\}/g;
const XML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

type PromptVars = Record<string, string>;

export function renderPrompt(path: string | URL, vars: PromptVars = {}): string {
  const template = readFileSync(path, "utf8").trim();

  return template.replace(INTERPOLATION, (_match, mode: string | undefined, key: string) => {
    if (!Object.hasOwn(vars, key)) {
      throw new Error(`Missing prompt variable: ${key}`);
    }

    switch (mode ?? "plain") {
      case "plain":
        return vars[key];
      case "xml": // preserve XML prompt envelopes around dynamic values.
        return vars[key].replace(/[&<>"']/g, (char) => XML_ESCAPE[char]);
      default:
        throw new Error(`Unknown prompt interpolation mode: ${mode}`);
    }
  });
}

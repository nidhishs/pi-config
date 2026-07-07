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

// render a prompt template file at an explicit path/URL.
export function renderPromptFile(file: string | URL, vars: PromptVars = {}): string {
  const template = readFileSync(file, "utf8").trim();

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

interface PromptLoaderOptions {
  dir?: string; // default: "prompts"
  ext?: string; // default: "md"
}

interface PromptLoader {
  resolve(name: string): URL;
  render(name: string, vars?: PromptVars): string;
}

// bound to the caller's module via import.meta.url;
// prompts resolve against that module's own prompt directory
export function createPromptLoader(
  baseImportMetaUrl: string | URL,
  options: PromptLoaderOptions = {},
): PromptLoader {
  const dir = options.dir ?? "prompts";
  const ext = options.ext ?? "md";
  const resolve = (name: string): URL => new URL(`./${dir}/${name}.${ext}`, baseImportMetaUrl);

  return {
    resolve,
    render: (name, vars) => renderPromptFile(resolve(name), vars),
  };
}

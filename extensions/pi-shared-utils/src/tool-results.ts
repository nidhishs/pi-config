import {
  formatSize,
  truncateHead,
  truncateTail,
  type AgentToolResult,
} from "@earendil-works/pi-coding-agent";

export function formatToolResultText(value: unknown, kind: "success" | "error"): string {
  const text = kind === "error" ? formatErrorValue(value) : formatSuccessValue(value);
  const result = kind === "error" ? truncateTail(text) : truncateHead(text);
  const warning = result.truncatedBy === "lines"
    ? `Truncated: showing ${result.outputLines} of ${result.totalLines} lines`
    : `Truncated: ${result.outputLines} lines shown (${formatSize(result.maxBytes)} limit)`;
  return result.truncated ? `${result.content}\n\n[${warning}]` : text;
}

export async function runTextToolResult(
  fn: () => unknown | Promise<unknown>,
): Promise<AgentToolResult<undefined>> {
  try {
    return createTextToolResult(formatToolResultText(await fn(), "success"));
  } catch (error) {
    return createTextToolResult(formatToolResultText(error, "error"));
  }
}

function formatSuccessValue(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2) ?? ""; }
  catch { return String(value);}
}

function formatErrorValue(value: unknown): string {
  const text = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  return /^(?:Error|\w+Error):\s/.test(text) ? text : `Error: ${text}`;
}

function createTextToolResult<TDetails = undefined>(
  text: string,
  details?: TDetails,
): AgentToolResult<TDetails> {
  return {
    content: [{ type: "text", text }],
    details: details as TDetails,
  };
}

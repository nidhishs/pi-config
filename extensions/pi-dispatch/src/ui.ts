// renders dispatch tool calls/results and the live in-tui progress widget

import { basename } from "node:path";
import { Box, Text, truncateToWidth, type TUI } from "@earendil-works/pi-tui";
import {
  highlightCode, keyHint, type AgentToolResult, type ExtensionContext, type MessageRenderer, type Theme,
} from "@earendil-works/pi-coding-agent";
import { liveSubagents, type Subagents } from "./runtime.ts";
import { emptyUsage, type DispatchResult, type SubagentResult, type SubagentUsage } from "./types.ts";

type Status = "running" | "failed" | "completed";

// status is derived, never stored: no finishedAt = running, error = failed, else completed
const statusOf = (r: SubagentResult): Status => !r.finishedAt ? "running" : r.error ? "failed" : "completed";

const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
function formatStatusIcon(theme: Theme, status: Status, frame = 0): string {
  return status === "failed" ? theme.fg("error", "✗")
    : status === "running" ? theme.fg("accent", SPINNER[frame % SPINNER.length])
    : theme.fg("success", "✓");
}

const BLINK_TICKS = 24; // dot blink period in 80ms ticks: text for half, dim for half (~2s cycle)
// only in-flight dispatches ever render (settled rows evict same tick), so the dot always blinks
const formatParentDot = (theme: Theme, frame: number) =>
  theme.fg(frame % BLINK_TICKS >= BLINK_TICKS / 2 ? "dim" : "text", "●");

function formatElapsed(startMs: number, endMs?: number): string {
  const total = Math.max(0, Math.round(((endMs ?? Date.now()) - startMs) / 1000));
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m${total % 60}s`;
  return `${Math.floor(total / 3600)}h${Math.floor((total % 3600) / 60)}m`;
}

function formatUsage({ inputTokens, outputTokens, cost }: SubagentUsage): string {
  const tk = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  const parts: string[] = [];
  if (inputTokens) parts.push(`↑${tk(inputTokens)}`);
  if (outputTokens) parts.push(`↓${tk(outputTokens)}`);
  if (cost >= 0.01) parts.push(`$${cost.toFixed(2)}`);
  return parts.join(" ");
}

const formatStatusLine = (theme: Theme, ...segments: Array<string | false | null | undefined>): string =>
  segments.filter(Boolean).join(theme.fg("muted", " • "));

const expandHint = (theme: Theme): string =>
  `${theme.fg("muted", " (")}${keyHint("app.tools.expand", "to expand")}${theme.fg("muted", ")")}`;

// aggregate = highest-precedence status across children (a failed child must not be forgotten while another still runs)
const PRECEDENCE: Status[] = ["running", "failed", "completed"]; // most important first; lower index wins
function summarizeSubagents(subagents: SubagentResult[]) {
  const usage = emptyUsage();
  const counts: Record<Status, number> = { running: 0, failed: 0, completed: 0 };
  for (const r of subagents) {
    usage.inputTokens += r.usage.inputTokens;
    usage.outputTokens += r.usage.outputTokens;
    usage.cost += r.usage.cost;
    counts[statusOf(r)]++;
  }
  const status = PRECEDENCE.find((status) => counts[status]) ?? "completed";
  return { status, usage, counts };
}

export function renderDispatchCall(args: { task?: unknown }, theme: Theme) {
  return new Text(theme.fg("toolTitle", theme.bold("dispatch ")) + theme.fg("muted", String(args.task ?? "").trim()), 0, 0);
}

export function renderDispatchResult(
  result: AgentToolResult<DispatchResult>, options: { expanded?: boolean }, theme: Theme,
) {
  const { dispatchId, code } = result.details!;
  if (options.expanded) {
    const lines = highlightCode(code.trim(), "javascript");
    const gutter = String(lines.length).length;
    const body = lines.map((line, i) =>
      theme.fg("dim", String(i + 1).padStart(gutter)) + "  " + line).join("\n");
    return new Text(body, 0, 0);
  }
  const loc = code.trim().split("\n").length;
  return new Text(
    theme.fg("muted", "⎿  ") + theme.fg("accent", dispatchId.slice(0, 8)) +
    theme.fg("muted", ": ") + theme.fg("syntaxNumber", `~${loc} loc`) +
    expandHint(theme),
    0, 0,
  );
}

// completion card for a background dispatch (customType "dispatch_result"); collapsed by default
export const renderDispatchCompletion: MessageRenderer<DispatchResult> = (message, { expanded }, theme) => {
  const text = typeof message.content === "string" ? message.content : "";
  const d = message.details;
  if (!d) return new Text(text, 0, 0);
  const sum = summarizeSubagents(d.subagents);
  const n = d.subagents.length;
  const usage = formatUsage(sum.usage);
  const parts = formatStatusLine(theme,
    n ? theme.fg("accent", `${n} ${n === 1 ? "run" : "runs"}`) : null,
    theme.fg("syntaxNumber", formatElapsed(d.startedAt, d.finishedAt)),
    usage && theme.fg("muted", usage),
  );
  const title = theme.fg("toolTitle", theme.bold("dispatch")) + " " + theme.fg("muted", d.task);
  const hint = !expanded && text ? expandHint(theme) : "";
  const summary = theme.fg("muted", "⎿  ") + formatStatusIcon(theme, sum.status) + " " + parts + hint;
  const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
  box.addChild(new Text(expanded && text ? `${title}\n${summary}\n\n${text}` : `${title}\n${summary}`, 0, 0));
  return box;
};

// ---- live widget ----

const WIDGET_KEY = "dispatch";
const MAX_DETAIL_ROWS = 3;

interface DispatchRecord { task: string; startedAt: number; finishedAt?: number; }

// a row survives until its body has delivered AND its subagents settle.
export class DispatchWidget {
  private dispatches = new Map<string, DispatchRecord>();
  private frame = 0; // spinner frame, advanced each tick
  private ui?: ExtensionContext["ui"];
  private tui?: TUI;

  constructor(private subagents: Subagents) {}

  // register an in-flight dispatch; mounts the panel on first call
  track(ui: ExtensionContext["ui"], id: string, task: string, startedAt: number) {
    this.dispatches.set(id, { task, startedAt });
    this.mount(ui);
  }

  // mark a dispatch's body done; tick() evicts the row once its subagents also settle
  finish(id: string, finishedAt: number) {
    const rec = this.dispatches.get(id);
    if (rec) rec.finishedAt = finishedAt;
    this.tick();
  }

  // unmount and reset; idempotent, used for both shutdown and idle self-teardown
  dispose() {
    this.ui?.setWidget(WIDGET_KEY, undefined);
    this.ui = this.tui = undefined;
  }

  private mount(ui: ExtensionContext["ui"]) {
    if (this.ui) return;
    this.ui = ui;
    ui.setWidget(WIDGET_KEY, (tui, theme) => {
      this.tui = tui;
      const timer = setInterval(() => this.tick(), 80).unref();
      return {
        render: (width: number) => this.renderRows(theme, width),
        invalidate: () => {},
        dispose: () => clearInterval(timer),
      };
    });
  }

  private renderRows(theme: Theme, width: number): string[] {
    const rows: string[] = [];
    // a newline in a row makes the terminal print 2 lines while pi counts 1 -> scrollback leak
    const row = (marker: string, ...segs: Array<any>) => rows.push(truncateToWidth(
      (marker + " " + formatStatusLine(theme, ...segs)).replace(/[\r\n]/g, " "), width
    ));
    for (const [id, d] of this.dispatches) {
      const subagents = liveSubagents(this.subagents, id);
      const usageText = formatUsage(summarizeSubagents(subagents).usage);
      row(
        formatParentDot(theme, this.frame),
        theme.fg("text", d.task),
        theme.fg("accent", id.slice(0, 8)),
        theme.fg("muted", formatElapsed(d.startedAt, d.finishedAt)),
        usageText && theme.fg("muted", usageText)
      );
      const visible = subagents.length > MAX_DETAIL_ROWS ? subagents.slice(1-MAX_DETAIL_ROWS) : subagents;
      if (subagents.length > MAX_DETAIL_ROWS) {
        const { counts } = summarizeSubagents(subagents.slice(0, -visible.length));
        const summary = PRECEDENCE.filter((status) => counts[status]).map((status) => `${counts[status]} ${status}`).join(", ");
        row(theme.fg("muted", "  ⋮"), theme.fg("muted", `(omitted: ${summary})`));
      }
      for (const r of visible) {
        const st = statusOf(r);
        const agent = basename(r.sessionPath, `-${r.id.slice(0, 8)}.jsonl`); // sessionPath's basename is "<agent>-<id8>.jsonl"
        row(
          "  " + formatStatusIcon(theme, st, this.frame),
          theme.fg("accent", r.id.slice(0, 8)),
          theme.fg("muted", formatElapsed(r.startedAt, r.finishedAt)),
          theme.fg("muted", agent),
          st === "running" && r.activity && theme.fg("muted", r.activity)
        );
      }
    }
    return rows;
  }

  private tick() {
    this.frame++;
    for (const [id, d] of this.dispatches) {
      if (d.finishedAt === undefined) continue; // body still running
      if (liveSubagents(this.subagents, id).some(r => statusOf(r) === "running")) continue; // a subagent outlives the body
      this.dispatches.delete(id); // settled: evict the row + its subagent records
      for (const [sid, r] of this.subagents) if (r.dispatchId === id) this.subagents.delete(sid);
    }
    if (this.dispatches.size === 0) return this.dispose();
    this.tui?.requestRender();
  }
}

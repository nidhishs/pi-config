import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { renderPrompt } from "../src/prompting.ts";

function renderFixture(body: string, vars: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-dispatch-prompts-"));
  const path = join(dir, "fixture.md");

  writeFileSync(path, body);
  try {
    return renderPrompt(path, vars);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("renderPrompt", () => {
  it("renders a prompt file by trimming and interpolating plain variables", () => {
    assert.equal(
      renderFixture("\n\nHello {{agent}}.\nUse {{tool}} when useful.\n\n", {
        agent: "explorer",
        tool: "dispatch",
      }),
      "Hello explorer.\nUse dispatch when useful.",
    );
  });

  it("escapes XML interpolation values without escaping the prompt envelope", () => {
    assert.equal(
      renderFixture("<result>{{xml:content}}</result>", {
        content: `Tom & Jerry <tag attr="value">it's fine</tag>`,
      }),
      "<result>Tom &amp; Jerry &lt;tag attr=&quot;value&quot;&gt;it&apos;s fine&lt;/tag&gt;</result>",
    );
  });

  it("throws when a prompt references a missing variable", () => {
    assert.throws(
      () => renderFixture("Available agents: {{agents}}"),
      /Missing prompt variable: agents/,
    );
  });

  it("throws when a prompt uses an unsupported interpolation mode", () => {
    assert.throws(
      () => renderFixture("{{json:agents}}", { agents: "explorer" }),
      /Unknown prompt interpolation mode: json/,
    );
  });
});
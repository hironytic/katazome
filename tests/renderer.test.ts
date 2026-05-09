import { describe, expect, test } from "bun:test";
import { render } from "../src/core/renderer.ts";
import { tokenize } from "../src/core/tokenizer.ts";
import { transpileTokens } from "../src/core/transpiler.ts";
import type { TagDefinition } from "../src/types.ts";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const cTagDef: TagDefinition = {
  code: [
    { start: "/*{%", end: "%}*/" },
    { start: "/*{%-", end: "-%}*/", trim: "both" },
  ],
  value: [
    { start: "_V_", end: "_" },
  ],
  comment: [
    { start: "/*{#", end: "#}*/" },
  ],
};

function makeTranspilate(template: string): string {
  return transpileTokens(tokenize(template, cTagDef), "./ktzm-runtime.ts");
}

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = join(tmpdir(), `ktzm-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return fn(dir).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe("render", () => {
  test("renders plain text template", async () => {
    await withTempDir(async (dir) => {
      const outputPath = join(dir, "output.txt");
      const transpilate = makeTranspilate("hello world\n");
      await render(transpilate, {}, outputPath);
      const content = await Bun.file(outputPath).text();
      expect(content).toBe("hello world\n");
    });
  });

  test("renders template with ktzm.input data", async () => {
    await withTempDir(async (dir) => {
      const outputPath = join(dir, "output.txt");
      const template = "/*{% const name = ktzm.input.name; %}*/Hello _V_name_!";
      const transpilate = makeTranspilate(template);
      await render(transpilate, { name: "World" }, outputPath);
      const content = await Bun.file(outputPath).text();
      expect(content).toBe("Hello World!");
    });
  });

  test("renders template with loop (trim removes surrounding newlines)", async () => {
    await withTempDir(async (dir) => {
      const outputPath = join(dir, "output.txt");
      // trim:"both" on for/} tags removes the \n before and after each item
      const template = "/*{%- for (const item of ktzm.input.items) { -%}*/\n_V_item_\n/*{%- } -%}*/";
      const transpilate = makeTranspilate(template);
      await render(transpilate, { items: ["a", "b", "c"] }, outputPath);
      const content = await Bun.file(outputPath).text();
      // Each item is output without surrounding newlines because of trim:"both"
      expect(content).toBe("abc");
    });
  });

  test("renders loop with explicit newlines in output", async () => {
    await withTempDir(async (dir) => {
      const outputPath = join(dir, "output.txt");
      // Use non-trim tags to preserve newlines
      const template = "/*{% for (const item of ktzm.input.items) { %}*/_V_item_\n/*{% } %}*/";
      const transpilate = makeTranspilate(template);
      await render(transpilate, { items: ["a", "b", "c"] }, outputPath);
      const content = await Bun.file(outputPath).text();
      expect(content).toBe("a\nb\nc\n");
    });
  });

  test("renders empty template to empty file", async () => {
    await withTempDir(async (dir) => {
      const outputPath = join(dir, "output.txt");
      const transpilate = makeTranspilate("");
      await render(transpilate, {}, outputPath);
      // File should exist and be empty
      const file = Bun.file(outputPath);
      const exists = await file.exists();
      expect(exists).toBe(true);
      const content = await file.text();
      expect(content).toBe("");
    });
  });

  test("throws on template with runtime error", async () => {
    await withTempDir(async (dir) => {
      const outputPath = join(dir, "output.txt");
      // A transpilate that throws at runtime
      const badTranspilate = `
/*ktzm:appended{*/
import ktzm from "./ktzm-runtime.ts";
/*}ktzm*/

throw new Error("intentional error");
`;
      await expect(render(badTranspilate, {}, outputPath)).rejects.toThrow();
    });
  });
});

import { describe, expect, test } from "bun:test";
import { transpileTokens, escapeString } from "../src/core/transpiler.ts";
import { tokenize } from "../src/core/tokenizer.ts";
import type { TagDefinition } from "../src/types.ts";
import { KatazomeError } from "../src/errors.ts";

const cTagDef: TagDefinition = {
  code: [
    { start: "/*{%", end: "%}*/" },
    { start: "/*{%-", end: "-%}*/", trim: "both" },
  ],
  value: [
    { start: "_V_", end: "_" },
    { start: "_V(\"", end: "\")" },
  ],
  comment: [
    { start: "/*{#", end: "#}*/" },
  ],
};

const RUNTIME = "./ktzm-runtime.ts";

function transpile(template: string): string {
  return transpileTokens(tokenize(template, cTagDef), RUNTIME);
}

describe("escapeString", () => {
  test("escapes backslash", () => expect(escapeString("a\\b")).toBe("a\\\\b"));
  test("escapes double quote", () => expect(escapeString('a"b')).toBe('a\\"b'));
  test("escapes tab", () => expect(escapeString("a\tb")).toBe("a\\tb"));
  test("leaves normal chars unchanged", () => expect(escapeString("hello")).toBe("hello"));
});

describe("transpileTokens", () => {
  test("header is always prepended", () => {
    const result = transpile("");
    expect(result).toContain(`import ktzm from "${RUNTIME}"`);
    expect(result).toContain("/*ktzm:appended{*/");
    expect(result).toContain("/*}ktzm*/");
  });

  test("plain text produces ktzm.out calls", () => {
    const result = transpile("hello\nworld\n");
    expect(result).toContain('ktzm.out("hello\\n");');
    expect(result).toContain('ktzm.out("world\\n");');
  });

  test("text without trailing newline", () => {
    const result = transpile("hello");
    expect(result).toContain('ktzm.out("hello");');
    expect(result).not.toContain('ktzm.out("hello\\n");');
  });

  test("code tag generates code marking", () => {
    const result = transpile("/*{% const x = 1; %}*/");
    expect(result).toContain("/*ktzm:code(0){*/ const x = 1; /*}ktzm*/");
  });

  test("trim code tag (index 1) generates code marking with index 1", () => {
    const result = transpile("/*{%- for (x of y) { -%}*/");
    expect(result).toContain("/*ktzm:code(1){*/ for (x of y) { /*}ktzm*/");
  });

  test("value tag generates value marking", () => {
    const result = transpile("_V_myVar_");
    expect(result).toContain("/*ktzm:value(0){*/ktzm.out(String(myVar));/*}ktzm*/");
  });

  test("comment tag generates comment marking", () => {
    const result = transpile("/*{# a comment #}*/");
    expect(result).toContain("/*ktzm:comment(0){*//* a comment *//*}ktzm*/");
  });

  test("trim 'both' removes surrounding whitespace and newlines", () => {
    const template = "Hello    \n/*{%- for (const x of items) { -%}*/\nline\n/*{%- } -%}*/\n!";
    const result = transpile(template);

    // Literal "Hello" with trimmed "    \n" moved to ktzm:trimmed
    expect(result).toContain('ktzm.out("Hello");');
    expect(result).toContain("/*ktzm:trimmed{*//*    \n*//*}ktzm*/");

    // After the for tag, "\n" is trimmed from "line"
    expect(result).toContain("/*ktzm:trimmed{*//*\n*//*}ktzm*/");
    expect(result).toContain('ktzm.out("line");');

    // closing } tag with trimmed newlines
    expect(result).toContain('ktzm.out("!");');
  });

  test("trim 'start' only trims text before the tag", () => {
    const customDef: TagDefinition = {
      code: [{ start: "[%", end: "%]", trim: "start" }],
      value: [],
      comment: [],
    };
    const result = transpileTokens(tokenize("text   \n[% code %]after", customDef), RUNTIME);
    expect(result).toContain('ktzm.out("text");');
    expect(result).toContain("/*ktzm:trimmed{*//*   \n*//*}ktzm*/");
    expect(result).toContain('ktzm.out("after");');
  });

  test("trim 'end' only trims text after the tag", () => {
    const customDef: TagDefinition = {
      code: [{ start: "[%", end: "%]", trim: "end" }],
      value: [],
      comment: [],
    };
    const result = transpileTokens(tokenize("before[% code %]   \ntext", customDef), RUNTIME);
    expect(result).toContain('ktzm.out("before");');
    expect(result).toContain("/*ktzm:trimmed{*//*   \n*//*}ktzm*/");
    expect(result).toContain('ktzm.out("text");');
  });

  test("special characters in literal are escaped", () => {
    const result = transpile('say "hello" \\ world');
    expect(result).toContain('ktzm.out("say \\"hello\\" \\\\ world");');
  });

  test("uses the provided runtimeImportPath", () => {
    const tokens = tokenize("", cTagDef);
    const result = transpileTokens(tokens, "../some/path/runtime.ts");
    expect(result).toContain('import ktzm from "../some/path/runtime.ts"');
  });

  test("user imports are emitted inside the appended block", () => {
    const tokens = tokenize("", cTagDef);
    const result = transpileTokens(tokens, RUNTIME, [
      { path: "/abs/path/helpers.ts", as: "helpers" },
      { path: "/abs/path/utils.ts", as: "myUtils" },
    ]);
    expect(result).toContain('import * as helpers from "/abs/path/helpers.ts"');
    expect(result).toContain('import * as myUtils from "/abs/path/utils.ts"');
    const appendedStart = result.indexOf("/*ktzm:appended{*/");
    const appendedEnd = result.indexOf("/*}ktzm*/");
    const helpersPos = result.indexOf('import * as helpers');
    expect(helpersPos).toBeGreaterThan(appendedStart);
    expect(helpersPos).toBeLessThan(appendedEnd);
  });

  test("no user imports produces same output as before", () => {
    const tokens = tokenize("hello", cTagDef);
    const withEmpty = transpileTokens(tokens, RUNTIME, []);
    const withDefault = transpileTokens(tokens, RUNTIME);
    expect(withEmpty).toBe(withDefault);
  });
});

import { describe, expect, test } from "bun:test";
import { tokenize } from "../src/core/tokenizer.ts";
import { KatazomeError } from "../src/errors.ts";
import type { ExtensionTagDefinition, LiteralToken, TagToken } from "../src/types.ts";

const cTagDef: ExtensionTagDefinition = {
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

function literal(text: string): LiteralToken {
  return { kind: "literal", text };
}

function codeTag(tagIndex: number, content: string, trim = "none"): TagToken {
  return { kind: "code", tagIndex, content, trimMode: trim as any };
}

function valueTag(tagIndex: number, content: string): TagToken {
  return { kind: "value", tagIndex, content, trimMode: "none" };
}

function commentTag(tagIndex: number, content: string): TagToken {
  return { kind: "comment", tagIndex, content, trimMode: "none" };
}

describe("tokenize", () => {
  test("empty string produces no tokens", () => {
    expect(tokenize("", cTagDef)).toEqual([]);
  });

  test("plain text produces a single literal token", () => {
    expect(tokenize("hello world", cTagDef)).toEqual([literal("hello world")]);
  });

  test("single code tag with no surrounding text", () => {
    expect(tokenize("/*{% const x = 1; %}*/", cTagDef)).toEqual([
      codeTag(0, " const x = 1; "),
    ]);
  });

  test("code tag surrounded by text", () => {
    expect(tokenize("before/*{% code %}*/after", cTagDef)).toEqual([
      literal("before"),
      codeTag(0, " code "),
      literal("after"),
    ]);
  });

  test("trim code tag (index 1) gets trimMode 'both'", () => {
    const tokens = tokenize("/*{%- code -%}*/", cTagDef);
    expect(tokens).toEqual([codeTag(1, " code ", "both")]);
  });

  test("value tag with _V_..._", () => {
    const tokens = tokenize("int _V_myVar_ = 0;", cTagDef);
    expect(tokens).toEqual([
      literal("int "),
      valueTag(0, "myVar"),
      literal(" = 0;"),
    ]);
  });

  test("value tag with _V(\"...\") syntax", () => {
    const tokens = tokenize('_V("expr")', cTagDef);
    expect(tokens).toEqual([valueTag(1, "expr")]);
  });

  test("comment tag", () => {
    const tokens = tokenize("/*{# this is a comment #}*/", cTagDef);
    expect(tokens).toEqual([commentTag(0, " this is a comment ")]);
  });

  test("multiple tags in sequence", () => {
    const tokens = tokenize("a/*{%b%}*/c_V_d_e", cTagDef);
    expect(tokens).toEqual([
      literal("a"),
      codeTag(0, "b"),
      literal("c"),
      valueTag(0, "d"),
      literal("e"),
    ]);
  });

  test("literal with newlines", () => {
    const tokens = tokenize("line1\nline2\n", cTagDef);
    expect(tokens).toEqual([literal("line1\nline2\n")]);
  });

  test("throws on unclosed code tag", () => {
    expect(() => tokenize("/*{% unclosed", cTagDef)).toThrow(KatazomeError);
  });

  test("throws when literal contains /*ktzm", () => {
    expect(() => tokenize("text /*ktzm more", cTagDef)).toThrow(KatazomeError);
  });

  test("throws when literal contains ktzm*/", () => {
    expect(() => tokenize("text ktzm*/ more", cTagDef)).toThrow(KatazomeError);
  });

  test("longer start string takes precedence over shorter when at same position", () => {
    // "/*{%-" should win over "/*{%" when both start at same position
    const tokens = tokenize("/*{%- code -%}*/", cTagDef);
    expect((tokens[0] as TagToken).tagIndex).toBe(1); // the longer one
    expect((tokens[0] as TagToken).trimMode).toBe("both");
  });

  test("tag with empty content", () => {
    const tokens = tokenize("/*{%%}*/", cTagDef);
    expect(tokens).toEqual([codeTag(0, "")]);
  });

  test("template with mixed tags", () => {
    const template = "/*{# comment #}*/\n/*{% if (x) { %}*/\nhello\n/*{% } %}*/";
    const tokens = tokenize(template, cTagDef);
    expect(tokens).toHaveLength(5);
    expect(tokens[0]).toEqual(commentTag(0, " comment "));
    expect(tokens[1]).toEqual(literal("\n"));
    expect(tokens[2]).toEqual(codeTag(0, " if (x) { "));
    expect(tokens[3]).toEqual(literal("\nhello\n"));
    expect(tokens[4]).toEqual(codeTag(0, " } "));
  });
});

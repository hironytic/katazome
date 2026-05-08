import { describe, expect, test } from "bun:test";
import { detranspile } from "../src/core/detranspiler.ts";
import { tokenize } from "../src/core/tokenizer.ts";
import { transpileTokens } from "../src/core/transpiler.ts";
import type { ExtensionTagDefinition } from "../src/types.ts";
import { KatazomeError } from "../src/errors.ts";

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

const RUNTIME = "./ktzm-runtime.ts";

/**
 * Performs a round-trip: template → tokens → transpilate → detranspilate.
 * Returns the detranspiled result.
 */
function roundTrip(template: string): string {
  const tokens = tokenize(template, cTagDef);
  const transpilate = transpileTokens(tokens, RUNTIME);
  return detranspile(transpilate, cTagDef);
}

describe("detranspile", () => {
  test("round-trips plain text", () => {
    expect(roundTrip("hello world\n")).toBe("hello world\n");
  });

  test("round-trips plain text without trailing newline", () => {
    expect(roundTrip("hello")).toBe("hello");
  });

  test("round-trips empty template", () => {
    expect(roundTrip("")).toBe("");
  });

  test("round-trips code tag", () => {
    const template = "/*{% const x = 1; %}*/\nhello\n";
    expect(roundTrip(template)).toBe(template);
  });

  test("round-trips trim code tag", () => {
    const template = "Hello    \n/*{%- for (const x of items) { -%}*/\nline\n/*{%- } -%}*/\n!";
    expect(roundTrip(template)).toBe(template);
  });

  test("round-trips value tag (index 0)", () => {
    const template = "int _V_myVar_ = 0;\n";
    expect(roundTrip(template)).toBe(template);
  });

  test("round-trips value tag (index 1)", () => {
    const template = 'void _V("funcName")(void);\n';
    expect(roundTrip(template)).toBe(template);
  });

  test("round-trips comment tag", () => {
    const template = "/*{# hidden comment #}*/\nhello\n";
    expect(roundTrip(template)).toBe(template);
  });

  test("round-trips multiline template with mixed tags", () => {
    const template = [
      "/*{# declare function #}*/\n",
      "/*{% const name = ktzm.input.name; %}*/\n",
      "void _V_name_(void) {\n",
      '/*{%- for (const [k, v] of ktzm.input.vars) { -%}*/\n',
      '  int _V_k_ = _V("v");\n',
      "/*{%- } -%}*/\n",
      "}\n",
    ].join("");
    expect(roundTrip(template)).toBe(template);
  });

  test("round-trips special characters in literals", () => {
    const template = 'say "hello" \\ world\n';
    expect(roundTrip(template)).toBe(template);
  });

  test("round-trips template ending with no trailing newline", () => {
    const template = "line1\nline2";
    expect(roundTrip(template)).toBe(template);
  });

  test("detranspiles code tag marking directly", () => {
    // The literal "\n" after the code tag becomes ktzm.out("\n") in transpilate.
    const transpilate = `/*ktzm:appended{*/
import ktzm from "./ktzm-runtime.ts";
/*}ktzm*/

/*ktzm:code(0){*/ const x = 1; /*}ktzm*/
ktzm.out("\\n");
ktzm.out("hello\\n");
`;
    const result = detranspile(transpilate, cTagDef);
    expect(result).toBe("/*{% const x = 1; %}*/\nhello\n");
  });

  test("detranspiles value tag with index 1", () => {
    const transpilate = `/*ktzm:appended{*/
import ktzm from "./ktzm-runtime.ts";
/*}ktzm*/

/*ktzm:value(1){*/ktzm.out(String(expr));/*}ktzm*/
`;
    const result = detranspile(transpilate, cTagDef);
    expect(result).toBe('_V("expr")');
  });

  test("detranspiles trimmed blocks", () => {
    // Trimmed whitespace is stored verbatim inside ktzm:trimmed comments.
    // Template: "Hello    \n/*{%- for ... -%}*/\nline\n/*{%- } -%}*/\n!"
    // "    \n" is trimmed from after "Hello", "\n" from before/after "line".
    const transpilate = "/*ktzm:appended{*/\nimport ktzm from \"./ktzm-runtime.ts\";\n/*}ktzm*/\n\n" +
      "ktzm.out(\"Hello\");\n" +
      "/*ktzm:trimmed{*//*    \n*//*}ktzm*/\n" +
      "/*ktzm:code(1){*/ for (const x of items) { /*}ktzm*/\n" +
      "/*ktzm:trimmed{*//*\n*//*}ktzm*/\n" +
      "ktzm.out(\"line\");\n" +
      "/*ktzm:trimmed{*//*\n*//*}ktzm*/\n" +
      "/*ktzm:code(1){*/ } /*}ktzm*/\n" +
      "/*ktzm:trimmed{*//*\n*//*}ktzm*/\n" +
      "ktzm.out(\"!\");\n";
    const result = detranspile(transpilate, cTagDef);
    expect(result).toBe("Hello    \n/*{%- for (const x of items) { -%}*/\nline\n/*{%- } -%}*/\n!");
  });
});

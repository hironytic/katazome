import type { TagToken, Token } from "../types.ts";
import { KatazomeError } from "../errors.ts";

/**
 * Transpiles an array of tokens into a TypeScript (transpilate) string.
 *
 * @param tokens            Token array from the tokenizer.
 * @param runtimeImportPath Relative path from the transpilate file to the runtime file.
 * @returns                 The full transpilate source code.
 */
export function transpileTokens(tokens: Token[], runtimeImportPath: string): string {
  const parts: string[] = [];

  // Prepend the fixed import header.
  parts.push(`/*ktzm:appended{*/\nimport ktzm from "${runtimeImportPath}";\n/*}ktzm*/\n\n`);

  // Process each token, applying trim logic for adjacent tag/literal pairs.
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    if (token.kind !== "literal") {
      // Emit the tag marking directly.
      parts.push(generateTagMarking(token));
      continue;
    }

    // Literal token: apply trim based on neighboring tag tokens.
    let text = token.text;

    const prevToken = i > 0 ? tokens[i - 1] : undefined;
    const nextToken = i < tokens.length - 1 ? tokens[i + 1] : undefined;

    const trimStart =
      prevToken !== undefined &&
      prevToken.kind !== "literal" &&
      (prevToken.trimMode === "end" || prevToken.trimMode === "both");

    const trimEnd =
      nextToken !== undefined &&
      nextToken.kind !== "literal" &&
      (nextToken.trimMode === "start" || nextToken.trimMode === "both");

    if (trimStart) {
      const { trimmed, remaining } = trimLeading(text);
      if (trimmed.length > 0) {
        validateTrimmedString(trimmed);
        parts.push(`/*ktzm:trimmed{*//*${trimmed}*//*}ktzm*/\n`);
      }
      text = remaining;
    }

    if (trimEnd) {
      const { trimmed, remaining } = trimTrailing(text);
      // Emit the literal body first, then the trimmed suffix.
      parts.push(...generateLiteralLines(remaining));
      if (trimmed.length > 0) {
        validateTrimmedString(trimmed);
        parts.push(`/*ktzm:trimmed{*//*${trimmed}*//*}ktzm*/\n`);
      }
    } else {
      parts.push(...generateLiteralLines(text));
    }
  }

  return parts.join("");
}

// ---------------------------------------------------------------------------
// Tag marking generation
// ---------------------------------------------------------------------------

function generateTagMarking(token: TagToken): string {
  switch (token.kind) {
    case "code":
      return `/*ktzm:code(${token.tagIndex}){*/${token.content}/*}ktzm*/\n`;
    case "value":
      return `/*ktzm:value(${token.tagIndex}){*/ktzm.out(String(${token.content}));/*}ktzm*/\n`;
    case "comment":
      return `/*ktzm:comment(${token.tagIndex}){*//*${token.content}*//*}ktzm*/\n`;
  }
}

// ---------------------------------------------------------------------------
// Literal text processing
// ---------------------------------------------------------------------------

/**
 * Splits literal text into lines and generates ktzm.out() calls.
 * Each line (except the last if it has no trailing newline) gets `\n` appended.
 */
function generateLiteralLines(text: string): string[] {
  if (text.length === 0) return [];

  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const isLast = i === lines.length - 1;

    if (isLast) {
      // The last element after split: if empty, it means the text ended with \n
      // (which was already included in the previous line's \n), so skip.
      if (line.length > 0) {
        result.push(`ktzm.out("${escapeString(line)}");\n`);
      }
    } else {
      result.push(`ktzm.out("${escapeString(line)}\\n");\n`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Trim helpers
// ---------------------------------------------------------------------------

/**
 * Trims leading whitespace and newlines from text.
 * Returns the trimmed prefix and the remaining text.
 */
function trimLeading(text: string): { trimmed: string; remaining: string } {
  const match = text.match(/^[\s\n]*/);
  const trimmed = match?.[0] ?? "";
  return { trimmed, remaining: text.slice(trimmed.length) };
}

/**
 * Trims trailing whitespace and newlines from text.
 * Returns the trimmed suffix and the remaining text (without the suffix).
 */
function trimTrailing(text: string): { trimmed: string; remaining: string } {
  const match = text.match(/[\s\n]*$/);
  const trimmed = match?.[0] ?? "";
  return {
    trimmed,
    remaining: trimmed.length > 0 ? text.slice(0, -trimmed.length) : text,
  };
}

/**
 * Validates that a trimmed string does not contain the sequence star-slash,
 * which would break the ktzm:trimmed comment marking syntax.
 */
function validateTrimmedString(trimmed: string): void {
  if (trimmed.includes("*/")) {
    throw new KatazomeError(
      `Trimmed whitespace contains "*/" which would break the transpiled file's internal comment syntax. This should not happen with normal whitespace/newline content.`
    );
  }
}

// ---------------------------------------------------------------------------
// String escaping
// ---------------------------------------------------------------------------

/**
 * Escapes a string for use inside a double-quoted TypeScript string literal.
 */
export function escapeString(s: string): string {
  let result = "";
  for (const ch of s) {
    switch (ch) {
      case "\\":
        result += "\\\\";
        break;
      case '"':
        result += '\\"';
        break;
      case "\r":
        result += "\\r";
        break;
      case "\t":
        result += "\\t";
        break;
      case "\0":
        result += "\\0";
        break;
      default:
        result += ch;
    }
  }
  return result;
}

import type { TagDefinition } from "../types.ts";
import { KatazomeError } from "../errors.ts";

/**
 * Detranspiles a transpilate back to the original template.
 *
 * Recognized patterns (in precedence order):
 *   1. `/*ktzm:appended{* /.../*}ktzm* /`  → removed
 *   2. `/*ktzm:trimmed{* //* text * //*}ktzm* /` → restored trimmed whitespace
 *   3. `/*ktzm:code(n){* /.../*}ktzm* /`   → code tag
 *   4. `/*ktzm:value(n){* /ktzm.out(String(expr));/*}ktzm* /` → value tag
 *   5. `/*ktzm:comment(n){* //* text * //*}ktzm* /` → comment tag
 *   6. `ktzm.out("...");`                  → unescaped literal text
 *
 * @param text    The transpilate source code.
 * @param tagDef  Tag definitions for the original file's extension.
 * @returns       The reconstructed template source.
 */
export function detranspile(text: string, tagDef: TagDefinition): string {
  const parts: string[] = [];
  let pos = 0;

  while (pos < text.length) {
    // Try to match any known pattern at the current position.
    // First, skip pure whitespace between statements.
    const wsMatch = text.slice(pos).match(/^[\s]+/);
    if (wsMatch && wsMatch[0] !== undefined) {
      // Check if there's a recognized pattern after this whitespace.
      const afterWs = pos + wsMatch[0].length;
      if (isAtRecognizedPattern(text, afterWs)) {
        pos = afterWs;
        continue;
      }
    }

    // Try each pattern in priority order.
    const result = tryMatchPattern(text, pos, tagDef);
    if (result !== undefined) {
      if (result.output !== undefined) {
        parts.push(result.output);
      }
      pos = result.nextPos;
      continue;
    }

    // Nothing matched at this position — skip one character.
    // This handles any whitespace/newlines between recognized statements
    // that weren't consumed above.
    if (text[pos] === "\n" || text[pos] === "\r" || text[pos] === " " || text[pos] === "\t") {
      pos++;
      continue;
    }

    // Unexpected content.
    const snippet = text.slice(pos, pos + 40).replace(/\n/g, "\\n");
    throw new KatazomeError(`Unexpected content in transpiled file at position ${pos}: "${snippet}"`);
  }

  return parts.join("");
}

interface MatchResult {
  /** Text to emit (undefined means emit nothing). */
  output: string | undefined;
  /** Position in the source after the matched pattern. */
  nextPos: number;
}

function isAtRecognizedPattern(text: string, pos: number): boolean {
  if (pos >= text.length) return true;
  return (
    text.startsWith("/*ktzm:", pos) ||
    text.startsWith("ktzm.out(", pos)
  );
}

function tryMatchPattern(
  text: string,
  pos: number,
  tagDef: TagDefinition
): MatchResult | undefined {
  // Pattern 1-5: comment markings
  if (text.startsWith("/*ktzm:", pos)) {
    return tryMatchMarking(text, pos, tagDef);
  }

  // Pattern 6: ktzm.out("...");
  if (text.startsWith('ktzm.out("', pos)) {
    return tryMatchLiteralOut(text, pos);
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Marking matchers
// ---------------------------------------------------------------------------

function tryMatchMarking(
  text: string,
  pos: number,
  tagDef: TagDefinition
): MatchResult | undefined {
  // Determine the marking kind by peeking at the name.
  const afterPrefix = pos + "/*ktzm:".length;

  if (text.startsWith("appended{*/", afterPrefix)) {
    return matchAppended(text, pos);
  }
  if (text.startsWith("trimmed{*/", afterPrefix)) {
    return matchTrimmed(text, pos);
  }
  if (text.startsWith("code(", afterPrefix)) {
    return matchTagMarking(text, pos, "code", tagDef);
  }
  if (text.startsWith("value(", afterPrefix)) {
    return matchTagMarking(text, pos, "value", tagDef);
  }
  if (text.startsWith("comment(", afterPrefix)) {
    return matchTagMarking(text, pos, "comment", tagDef);
  }

  return undefined;
}

/** Matches and discards the `/*ktzm:appended{...}ktzm*\/` block. */
function matchAppended(text: string, pos: number): MatchResult {
  const end = findMarkingEnd(text, pos);
  return { output: undefined, nextPos: end };
}

/** Matches a `/*ktzm:trimmed{*\//* text *\//*}ktzm*\/` block and restores the trimmed text. */
function matchTrimmed(text: string, pos: number): MatchResult {
  // Structure: /*ktzm:trimmed{*//* CONTENT *//*}ktzm*/
  const openMarker = "/*ktzm:trimmed{*/";
  const closeMarker = "/*}ktzm*/";

  if (!text.startsWith(openMarker, pos)) {
    throw new KatazomeError(`Expected trimmed marking at position ${pos}`);
  }

  const afterOpen = pos + openMarker.length;
  // Now we expect: /* CONTENT *//*}ktzm*/
  if (!text.startsWith("/*", afterOpen)) {
    throw new KatazomeError(`Expected /* after trimmed opening marker at position ${afterOpen}`);
  }

  const contentStart = afterOpen + 2; // skip /*
  // Find the closing */ of the content comment
  const contentEnd = text.indexOf("*/", contentStart);
  if (contentEnd === -1) {
    throw new KatazomeError(`Unterminated trimmed content comment at position ${contentStart}`);
  }

  const trimmedText = text.slice(contentStart, contentEnd);
  const afterContentComment = contentEnd + 2; // skip */

  if (!text.startsWith(closeMarker, afterContentComment)) {
    throw new KatazomeError(`Expected ${closeMarker} after trimmed content at position ${afterContentComment}`);
  }

  return {
    output: trimmedText,
    nextPos: afterContentComment + closeMarker.length,
  };
}

/** Matches a code/value/comment tag marking and reconstructs the original tag. */
function matchTagMarking(
  text: string,
  pos: number,
  kind: "code" | "value" | "comment",
  tagDef: TagDefinition
): MatchResult {
  // Structure: /*ktzm:KIND(N){*/ CONTENT /*}ktzm*/
  const prefixPart = `/*ktzm:${kind}(`;
  if (!text.startsWith(prefixPart, pos)) {
    throw new KatazomeError(`Expected ${prefixPart} at position ${pos}`);
  }

  const indexStart = pos + prefixPart.length;
  const indexEnd = text.indexOf("){*/", indexStart);
  if (indexEnd === -1) {
    throw new KatazomeError(`Malformed ${kind} marking at position ${pos}: missing ){*/`);
  }

  const tagIndex = parseInt(text.slice(indexStart, indexEnd), 10);
  if (isNaN(tagIndex)) {
    throw new KatazomeError(`Invalid tag index in ${kind} marking at position ${pos}`);
  }

  const defs = tagDef[kind];
  if (tagIndex >= defs.length || defs[tagIndex] === undefined) {
    throw new KatazomeError(
      `Tag index ${tagIndex} out of range for ${kind} tags (${defs.length} defined).`
    );
  }

  const def = defs[tagIndex];

  const realContentStart = indexEnd + 4; // skip ){*/

  const closeMarker = "/*}ktzm*/";
  const closePos = text.indexOf(closeMarker, realContentStart);
  if (closePos === -1) {
    throw new KatazomeError(`Unterminated ${kind} marking at position ${pos}`);
  }

  const rawContent = text.slice(realContentStart, closePos);

  let output: string;

  if (kind === "code") {
    // code: the content is the raw TypeScript code
    output = def!.start + rawContent + def!.end;
  } else if (kind === "value") {
    // value: content is `ktzm.out(String(EXPR));`
    // Extract EXPR from between `ktzm.out(String(` and `));`
    const valuePrefix = "ktzm.out(String(";
    const valueSuffix = "));";
    if (!rawContent.startsWith(valuePrefix)) {
      throw new KatazomeError(`Malformed value marking content at position ${pos}: "${rawContent}"`);
    }
    if (!rawContent.endsWith(valueSuffix)) {
      throw new KatazomeError(`Malformed value marking content at position ${pos}: "${rawContent}"`);
    }
    const expr = rawContent.slice(valuePrefix.length, rawContent.length - valueSuffix.length);
    output = def!.start + expr + def!.end;
  } else {
    // comment: content is `/* COMMENT_TEXT */`
    if (!rawContent.startsWith("/*") || !rawContent.endsWith("*/")) {
      throw new KatazomeError(`Malformed comment marking content at position ${pos}: "${rawContent}"`);
    }
    const commentText = rawContent.slice(2, rawContent.length - 2);
    output = def!.start + commentText + def!.end;
  }

  return { output, nextPos: closePos + closeMarker.length };
}

// ---------------------------------------------------------------------------
// Literal out matcher
// ---------------------------------------------------------------------------

/** Matches `ktzm.out("...");` and returns the unescaped string. */
function tryMatchLiteralOut(text: string, pos: number): MatchResult | undefined {
  const prefix = 'ktzm.out("';
  if (!text.startsWith(prefix, pos)) return undefined;

  const contentStart = pos + prefix.length;

  // Find the closing `");` accounting for escape sequences.
  let i = contentStart;
  let raw = "";
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\\") {
      // Escape sequence
      const next = text[i + 1];
      switch (next) {
        case "n":  raw += "\n"; i += 2; break;
        case "r":  raw += "\r"; i += 2; break;
        case "t":  raw += "\t"; i += 2; break;
        case "0":  raw += "\0"; i += 2; break;
        case '"':  raw += '"';  i += 2; break;
        case "\\": raw += "\\"; i += 2; break;
        default:
          raw += ch;
          i++;
      }
    } else if (ch === '"') {
      // Check for closing `");`
      if (text[i + 1] === ")" && text[i + 2] === ";") {
        return { output: raw, nextPos: i + 3 };
      }
      // A literal double-quote not preceded by backslash — this shouldn't happen
      // in a well-formed transpilate, but handle gracefully.
      return undefined;
    } else {
      raw += ch;
      i++;
    }
  }

  // No closing found
  return undefined;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Finds the end position (exclusive) of a `/*ktzm:...{*\/...*\/}ktzm*\/` block. */
function findMarkingEnd(text: string, pos: number): number {
  const closeMarker = "/*}ktzm*/";
  const end = text.indexOf(closeMarker, pos);
  if (end === -1) {
    throw new KatazomeError(`Unterminated ktzm marking at position ${pos}`);
  }
  return end + closeMarker.length;
}

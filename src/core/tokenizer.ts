import type { TagDefinition, TagKind, TagToken, TagTypeDefinition, Token, TrimMode } from "../types.ts";
import { KatazomeError } from "../errors.ts";

/** Strings that must not appear in literal text (they would collide with comment markings). */
const FORBIDDEN_IN_LITERAL = ["/*ktzm", "ktzm*/"];

interface TagCandidate {
  kind: TagKind;
  tagIndex: number;
  def: TagTypeDefinition;
}

/**
 * Tokenizes a template file into a flat list of LiteralToken and TagToken.
 *
 * @param text    The full template file content.
 * @param tagDef  Tag definitions for the file's extension.
 * @returns       An array of tokens in document order.
 * @throws        KatazomeError on syntax errors (forbidden text, unclosed tags, etc.)
 */
export function tokenize(text: string, tagDef: TagDefinition): Token[] {
  // Build a flat list of all tag candidates with their start strings.
  const candidates: TagCandidate[] = [];

  for (const [index, def] of tagDef.code.entries()) {
    candidates.push({ kind: "code", tagIndex: index, def });
  }
  for (const [index, def] of tagDef.value.entries()) {
    candidates.push({ kind: "value", tagIndex: index, def });
  }
  for (const [index, def] of tagDef.comment.entries()) {
    candidates.push({ kind: "comment", tagIndex: index, def });
  }

  const tokens: Token[] = [];
  let pos = 0;

  while (pos < text.length) {
    // Find the earliest occurring tag start among all candidates.
    let bestPos = -1;
    let bestCandidate: TagCandidate | undefined;

    for (const candidate of candidates) {
      const found = text.indexOf(candidate.def.start, pos);
      if (found === -1) continue;
      if (
        bestPos === -1 ||
        found < bestPos ||
        // Tie-break: prefer longer start string (more specific match).
        (found === bestPos && candidate.def.start.length > (bestCandidate?.def.start.length ?? 0))
      ) {
        bestPos = found;
        bestCandidate = candidate;
      }
    }

    if (bestPos === -1 || bestCandidate === undefined) {
      // No more tags found; the rest is literal text.
      const remaining = text.slice(pos);
      checkForbiddenInLiteral(text, pos, remaining);
      if (remaining.length > 0) {
        tokens.push({ kind: "literal", text: remaining });
      }
      break;
    }

    // Emit the literal text before the tag.
    const literalText = text.slice(pos, bestPos);
    checkForbiddenInLiteral(text, pos, literalText);
    if (literalText.length > 0) {
      tokens.push({ kind: "literal", text: literalText });
    }

    // Find the closing end delimiter.
    const startLen = bestCandidate.def.start.length;
    const endStart = text.indexOf(bestCandidate.def.end, bestPos + startLen);
    if (endStart === -1) {
      const { line, col } = positionToLineCol(text, bestPos);
      throw new KatazomeError(
        `Unclosed ${bestCandidate.kind} tag: "${bestCandidate.def.start}" at line ${line}, column ${col} has no matching "${bestCandidate.def.end}".`
      );
    }

    const content = text.slice(bestPos + startLen, endStart);
    const trimMode: TrimMode = bestCandidate.def.trim ?? "none";

    const tagToken: TagToken = {
      kind: bestCandidate.kind,
      tagIndex: bestCandidate.tagIndex,
      content,
      trimMode,
    };
    tokens.push(tagToken);

    pos = endStart + bestCandidate.def.end.length;
  }

  return tokens;
}

function checkForbiddenInLiteral(fullText: string, sliceStart: number, slice: string): void {
  for (const forbidden of FORBIDDEN_IN_LITERAL) {
    const idx = slice.indexOf(forbidden);
    if (idx !== -1) {
      const { line, col } = positionToLineCol(fullText, sliceStart + idx);
      throw new KatazomeError(
        `Literal text must not contain "${forbidden}" (line ${line}, column ${col}). It collides with Katazome's internal comment markings.`
      );
    }
  }
}

/**
 * Converts a character offset within `text` to a 1-based line and column number.
 */
function positionToLineCol(text: string, pos: number): { line: number; col: number } {
  const before = text.slice(0, pos);
  const lines = before.split("\n");
  const line = lines.length;
  const col = (lines[lines.length - 1]?.length ?? 0) + 1;
  return { line, col };
}

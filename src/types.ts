/**
 * Shared type definitions for Katazome.
 */

// ---------------------------------------------------------------------------
// Settings / Tag definitions
// ---------------------------------------------------------------------------

/** The kind of a template tag. */
export type TagKind = "code" | "value" | "comment";

/** How surrounding whitespace/newlines are trimmed around a tag. */
export type TrimMode = "start" | "end" | "both" | "none";

/**
 * A single tag definition: one start/end pair for a given tag kind.
 * Multiple definitions may exist for a single kind (e.g. with-trim and without-trim variants).
 */
export interface TagTypeDefinition {
  /** The opening delimiter of the tag. */
  start: string;
  /** The closing delimiter of the tag. */
  end: string;
  /**
   * Trim behavior for whitespace/newlines adjacent to this tag.
   * When omitted, "none" is assumed.
   */
  trim?: TrimMode;
}

/** All tag definitions for a single file extension. */
export interface ExtensionTagDefinition {
  code: TagTypeDefinition[];
  value: TagTypeDefinition[];
  comment: TagTypeDefinition[];
}

/** The parsed setting file structure. */
export interface Setting {
  tagDefinition: Record<string, ExtensionTagDefinition>;
}

// ---------------------------------------------------------------------------
// Tokens (tokenizer output)
// ---------------------------------------------------------------------------

/** A literal (plain text) segment of the template. */
export interface LiteralToken {
  kind: "literal";
  /** The raw text content. May span multiple lines. */
  text: string;
}

/** A code, value, or comment tag found in the template. */
export interface TagToken {
  /** The kind of tag. */
  kind: TagKind;
  /** Index into the tag-kind's definition array (e.g. tagDef.code[tagIndex]). */
  tagIndex: number;
  /** The inner content of the tag (between start and end delimiters). */
  content: string;
  /** Resolved trim mode (never undefined; defaults to "none"). */
  trimMode: TrimMode;
}

export type Token = LiteralToken | TagToken;

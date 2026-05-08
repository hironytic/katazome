# Katazome — Developer Notes

## Key Design Decisions

- **`undefined` over `null`**: use `undefined` to represent the absence of a value. `null` is only acceptable where the bun's API or the third-party libraries explicitly require it. Values received as `null` from external sources should be converted with `?? undefined` before use in internal code.

---

## Terminology

### User-facing terms

| Term | Description |
|------|-------------|
| transpile | Step 1: convert a template file into a TypeScript file (transpilate) |
| render | Step 2: execute the transpilate with Bun to produce the final output file |
| generate | Steps 1+2 combined in a single command |
| detranspile | Reverse a transpilate back into the original template (for debugging) |
| transpiled file | Output of transpile (e.g. `template.c.ts`) |
| generated file | Output of render/generate (the final file, e.g. `output.c`) |
| code tag | A tag that embeds raw TypeScript code into the transpilate |
| value tag | A tag whose expression result is interpolated into the output |
| comment tag | A tag whose content is discarded and does not appear in the generated file |

### Internal / source-code terms

| Term | Description |
|------|-------------|
| transpilate | The TypeScript file produced by transpile (used in source code and docs) |
| rendition | The generated file produced by render (used in source code and docs) |

---

## Running the Project

### Tests

```bash
bun test
```

### Type-checking

```bash
bun run typecheck
```

---

## Non-obvious Implementation Details

### Renderer: output file is pre-created

`src/core/renderer.ts` calls `writeFileSync(outputFilePath, "")` **before** spawning the Bun subprocess. This ensures the output file always exists even when the template produces no output. Without this, an empty template would leave no output file because the runtime's exit hook may not fire reliably for near-empty Bun modules.

### Runtime: dual exit hooks

`src/runtime/content.ts` registers output-flushing on **both** `process.on("beforeExit")` and `process.on("exit")`. This is because Bun's `process.on("exit")` does not reliably fire when a module has no top-level async work (e.g., an empty template that only performs an import). The `beforeExit` hook fires first when the event loop empties, `exit` fires as a safety net, and a guard flag prevents double-writes.

### Input data normalization

The main process parses `--input` files (JSON or JSON5) and re-serializes the result as **plain JSON** to a temp file. The runtime (`ktzm-runtime.ts`) only reads plain JSON. This means all format handling (JSON5 etc.) is confined to the main process; the runtime has no parser dependency.

### tagIndex and setting file compatibility

The `n` in markings like `/*ktzm:code(n){*/` is the zero-based index into the corresponding array in the setting file (e.g., `tagDefinition["c"].code[n]`). **Reordering tag definitions in a setting file breaks compatibility with existing transpilates**, because the stored indices will no longer map to the correct tag syntax during detranspile.

### Trim direction naming

The `"trim"` field names can be confusing:

| Value | What is actually trimmed |
|-------|--------------------------|
| `"start"` | Trailing whitespace/newlines from the **preceding** literal (before the tag) |
| `"end"` | Leading whitespace/newlines from the **following** literal (after the tag) |
| `"both"` | Both of the above |

Think of "start" and "end" as referring to which side of the tag boundary is trimmed (the start-side = what comes just before; the end-side = what comes just after).

### Longer tag start wins on tie

When two tag definitions share a common prefix (e.g., `/*{%` and `/*{%-`), the tokenizer picks the **longer** start string if both would match at the same position. This is what makes the trim variant (`/*{%-`) take precedence over the plain variant (`/*{%`) at the same location.

### JSDoc comments must not contain `*/`

A block comment `/** ... */` is terminated by the first `*/` it encounters. Do not write the literal sequence `*/` inside JSDoc comments (e.g., when describing the comment marking syntax). Rephrase as "star-slash" or similar.

# Katazome — Developer Notes

## Project Overview

Katazome is a CLI tool (command: `ktzm`) built with Bun that generates programming scaffolds from user-defined templates.

### Key Features

- **User-defined tag delimiters**: The opening and closing symbols for template tags (used to embed code or values) are defined by the user. By choosing delimiters that fit the syntax of the target language, templates can be written without breaking syntax highlighting in that language's editor.
- **TypeScript for template logic**: Branching, iteration, and other logic inside templates is written in TypeScript/JavaScript. Users can also import their own TypeScript helper files.
- **Debug workflow**: Internally, `generate` transpiles a template to a TypeScript file (transpilate) and then executes it. The `transpile` command exposes this intermediate file so it can be run directly for debugging. `detranspile` converts a modified transpilate back to the original template.
- **Directory-mode batch conversion**: When a directory is given as input, all templates inside are converted while preserving the subdirectory structure. This is the primary intended use case. Single-file conversion is also supported.
- **Dynamic output paths**: In directory mode, the output file path can be changed at runtime by template code, so generated files can be placed under different names or subdirectories.

## Terminology

### User-facing terms

| Term | Description |
|------|-------------|
| transpile | Step 1: convert a template file into a TypeScript file (transpilate) |
| render | Step 2: execute the transpilate with Bun to produce the final output file |
| generate | Steps 1+2 combined in a single command |
| detranspile | Reverse a transpilate back into the original template (for debugging) |
| transpile session | Output of `transpile` recording what was transpiled and where; used as input to `detranspile` (`ktzm-session.json`) |
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

## Commands

The primary command is `generate`. `transpile` and `detranspile` are debugging aids.

### generate

Transpiles and renders a template to produce the final output file(s).

```
ktzm generate [options] <template> <output>
```

| Argument / Option | Description |
|---|---|
| `<template>` | Template file or directory |
| `<output>` | Output file or directory |
| `--setting <file>` | Path to the setting file (default: `ktzm-setting.{json,json5,yaml,toml}` in the same directory as the template) |
| `--input <file>` | Input data file (JSON, JSON5, YAML, or TOML) |
| `--answer <name=value>` | Pre-supply an answer to a question; repeatable |

When `<template>` is a directory, `<output>` is treated as a directory target.

### transpile

Converts a template to a TypeScript transpilate for inspection and debugging. Also generates a runtime file (`ktzm-runtime.ts`) and a session file (`ktzm-session.json`) alongside the transpilate.

```
ktzm transpile [options] <template> [output]
```

| Argument / Option | Description |
|---|---|
| `<template>` | Template file or directory (`[output]` is required when this is a directory) |
| `[output]` | Output transpilate file or directory (default: `<template>.ts`) |
| `--setting <file>` | Path to the setting file |
| `--input <file>` | Input data file |
| `--answer <name=value>` | Pre-supply an answer to a question; repeatable |
| `--runtime <file>` | Output path for the runtime file (default: `ktzm-runtime.ts` next to the transpilate) |
| `--session <file>` | Output path for the session file (default: `ktzm-session.json` next to the transpilate) |
| `--force` | Skip the confirmation prompt when the output already exists |

The generated transpilate can be run directly with `bun run <transpilate>`. Set the `KTZM_OUTPUT_FILE_PATH` environment variable to specify the initial output file path when running manually.

### detranspile

Converts a transpilate back to the original template, using the session file produced by `transpile`.

```
ktzm detranspile [options] <session> [output]
```

| Argument / Option | Description |
|---|---|
| `<session>` | Session file (`ktzm-session.json`) or a directory containing it |
| `[output]` | Output template file or directory (default: original template path stored in the session — overwrites the original) |
| `--force` | Skip the confirmation prompt |

---

## Template API

Inside a template, the `ktzm` object is available with the following members:

| Member | Description |
|---|---|
| `ktzm.out(s: string)` | Append a string to the output buffer |
| `ktzm.input` | Input data passed via `--input` (type: `any`) |
| `ktzm.answer` | Answers to questions defined in the setting file (type: `any`) |
| `ktzm.outputFilePath` | Relative path of the output file; writable in directory mode only (changes in file mode are ignored) |

---

## Key Design Decisions

- **`undefined` over `null`**: use `undefined` to represent the absence of a value. `null` is only acceptable where the bun's API or the third-party libraries explicitly require it. Values received as `null` from external sources should be converted with `?? undefined` before use in internal code.

- **`transpile` as a debugging aid for `generate`**: The primary command is `generate` (transpile + render in one step). When `generate` fails at render time, users need to inspect the intermediate transpilate to debug code tags and value tags they wrote. `transpile` serves this purpose: it produces the same transpilate that `generate` uses internally, so users can run it directly with `bun run` to reproduce and investigate failures. `detranspile` then helps them apply any fixes made in the transpilate back to the original template. This means **the transpilate produced by `transpile` and the transpilate used internally by `generate` must behave as consistently as possible**. Designs that cause `generate`'s internal execution to diverge from a plain `bun run` of the transpilate undermine the debugging workflow.

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

### Input data normalization

The main process parses `--input` files (JSON, JSON5, YAML, or TOML) and re-serializes the result as **plain JSON** to a temp file. The runtime (`ktzm-runtime.ts`) only reads plain JSON. This means all format handling is confined to the main process; the runtime has no parser dependency.

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

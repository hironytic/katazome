# Katazome

A CLI tool that generates source files from your custom templates.

## Features

- **User-defined tag delimiters** — Choose delimiters that fit your target language's syntax so templates remain valid, syntax-highlighted source files.
- **TypeScript for template logic** — Write branching, loops, and any custom logic in TypeScript/JavaScript inside templates. Import your own helper files too.
- **Batch directory generation** — Point `ktzm` at a directory and it converts every template inside while preserving the subdirectory structure.
- **Dynamic output paths** — Template code can change the output file name or path at runtime, so a single template can produce differently-named files.
- **Debug workflow** — The `transpile` and `detranspile` commands let you inspect and edit the intermediate TypeScript file produced from a template.

## Requirements

- Node.js >= 24.0.0

## Installation

```bash
npm install -g @hironytic/katazome
```

## Quick Start

The `examples/csharp-efcore-entity/` directory in this repo shows a complete example. It generates a C# Entity Framework Core entity class and repository interface from two prompts.

**Template directory layout:**

```
csharp-efcore-entity/
├── ktzm-setting.yaml       # tag definitions, questions, and imports
├── case-converter.mts      # helper: PascalCase / camelCase / snake_case
├── EntityName.cs           # template → Entity class
└── IEntityNameRepository.cs # template → Repository interface
```

**Run:**

```bash
ktzm generate examples/csharp-efcore-entity/ output/
```

Katazome asks two questions:

```
? Entity name (space-separated words, e.g. "user profile"): user profile
? Namespace (MyApp.Models): MyApp.Models
```

**Output:**

```
output/
├── UserProfile.cs
└── IUserProfileRepository.cs
```

## Concepts

### Templates

A template is an ordinary source file with tags embedded in it. Tags contain TypeScript code or value expressions. Everything outside a tag is copied verbatim to the output.

There are three kinds of tags:

| Kind | What it does |
|------|--------------|
| **code tag** | Embeds a block of TypeScript code that runs during generation. |
| **value tag** | Embeds an expression; its string result is inserted into the output. |
| **comment tag** | Marks a region that is discarded and never appears in the output. |

### Tag Delimiters

You define the opening and closing strings for each tag kind in the setting file. For example, in C# or C files you might use `/*{% ... %}*/` for code tags so the template is still valid C syntax. For value tags, pick short delimiters that do not conflict with target-language syntax (e.g. `ZZ ... __`).

**C# template excerpt:**

```csharp
/*{%
const NamePascal = cc.toPascalCase(ktzm.answer.name);
const ns = ktzm.answer.namespace;
%}*/
namespace ZZns__;

public class ZZNamePascal__ { ... }
```

When two tag definitions share a common prefix (e.g. `/*{%` and `/*{%-`), the longer one takes precedence at the same position.

### Setting File

The setting file (`ktzm-setting.yaml`) lives in the same directory as the templates. It defines tag delimiters, user questions, helper imports, and more.

## Setting File Reference

### `tagDefinition`

Defines the tag delimiters used across all template files.

```yaml
tagDefinition:
  code:
    - start: "/*{%"
      end: "%}*/"
      trim: both
  value:
    - start: ZZ
      end: __
    - start: zz
      end: __
  comment:
    - start: "/*{#"
      end: "#}*/"
```

Each entry has:

| Field | Required | Description |
|-------|----------|-------------|
| `start` | yes | Opening delimiter string |
| `end` | yes | Closing delimiter string |
| `trim` | no | Whitespace trimming: `"none"` (default), `"start"`, `"end"`, or `"both"` |

`trim: "start"` removes trailing whitespace/newlines from the text immediately **before** the tag. `trim: "end"` removes leading whitespace/newlines from the text immediately **after** the tag. `trim: "both"` does both.

### `questions`

Asks the user for values that templates can access via `ktzm.answer.<name>`.

**Text input:**

```yaml
questions:
  - name: entityName
    kind: text
    type: string
    message: "Entity name"
    default: MyEntity
```

**Select (choose from a list):**

```yaml
questions:
  - name: accessLevel
    kind: select
    message: "Access level"
    options:
      - label: Public
        value: public
      - label: Internal
        value: internal
    default: public
```

| Field | Applies to | Description |
|-------|-----------|-------------|
| `name` | both | Identifier used in `ktzm.answer.<name>` |
| `kind` | both | `"text"` or `"select"` |
| `message` | both | Prompt shown to the user |
| `type` | text only | `"string"` or `"number"` |
| `default` | both | Pre-filled / pre-selected value |
| `options` | select only | Array of `{ label, value }` objects |

### `imports`

Imports a TypeScript helper file and binds it to a namespace. Templates access it as `<namespace>.<export>`.

```yaml
imports:
  paths:
    - path: ./case-converter.mts
      as: cc
```

The helper file must be an ES module. Use the `.mts` or `.mjs` extension, or place a `package.json` with `{ "type": "module" }` in its directory (or an ancestor).

### `exclude`

File name patterns to skip when processing a template directory. Use this to keep helper files out of the output.

```yaml
exclude:
  - case-converter.mts
  - "*.local.*"
```

### `files`

Override tag definitions or imports for specific file name patterns. Useful when a template directory contains files in multiple languages.

```yaml
files:
  - pattern: "*.sql"
    tagDefinition:
      code:
        - start: "-- {%"
          end: "%}"
          trim: both
      value:
        - start: _V_
          end: _
```

Set `inherit: false` to use only the pattern-specific definition (ignoring the root `tagDefinition`).

### `existingFile`

Controls what happens when an output file already exists: `"overwrite"` (default), `"skip"`, `"error"`, or `"prompt"`. Can be set at the root level or per file pattern inside `files`.

## Commands

### `generate` — main command

Generates output from a template file or directory.

```
ktzm generate [options] <template> <output>
```

| Argument / Option | Description |
|-------------------|-------------|
| `<template>` | Template file or directory |
| `<output>` | Output file or directory |
| `--setting <file>` | Path to the setting file (default: `ktzm-setting.{json,yaml}` next to the template) |
| `--input <file>` | Input data file (JSON or YAML); available in templates as `ktzm.input` |
| `--answer <name=value>` | Pre-supply an answer to a question; can be repeated |

When `<template>` is a directory, `<output>` is treated as a directory target.

### `transpile` and `detranspile` — debug helpers

See [Debug Workflow](#debug-workflow) below.

## Template API

Inside every template the `ktzm` object is available:

| Member | Description |
|--------|-------------|
| `ktzm.out(s: string)` | Append a string to the output buffer |
| `ktzm.input` | Data passed via `--input` (type: `any`) |
| `ktzm.answer` | Answers to the questions defined in the setting file (type: `any`) |
| `ktzm.outputFilePath` | Relative path of the output file; writable in directory mode to rename or relocate the output |

## Debug Workflow

When `ktzm generate` fails during execution, you can inspect the intermediate TypeScript file that was generated from your template.

**Step 1 — produce the transpiled file:**

```bash
ktzm transpile examples/csharp-efcore-entity/ output-debug/
```

This writes a `.mts` file for each template alongside a `ktzm-runtime.mts` and a `ktzm-session.json`.

**Step 2 — run it directly:**

```bash
KTZM_OUTPUT_FILE_PATH=UserProfile.cs node output-debug/EntityName.cs.mts
```

You can now edit the transpiled `.mts` file and re-run it to iterate quickly.

**Step 3 — apply fixes back to the template:**

```bash
ktzm detranspile output-debug/ktzm-session.json
```

This converts the edited transpiled file back to the original template.

## License

MIT — see [LICENSE](LICENSE).

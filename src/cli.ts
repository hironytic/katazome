#!/usr/bin/env bun
import { Command } from "commander";
import { runGenerate } from "./commands/generate.ts";
import { runTranspile } from "./commands/transpile.ts";
import { runDetranspile } from "./commands/detranspile.ts";
import { KatazomeError } from "./errors.ts";
import { CLI_VERSION } from "./version.ts";

const program = new Command();

program
  .name("ktzm")
  .description("Generate source files from TypeScript templates")
  .version(CLI_VERSION);

// ---------------------------------------------------------------------------
// generate
// ---------------------------------------------------------------------------
program
  .command("generate")
  .description("Transpile and render a template to produce a final output file")
  .option("--setting <file>", "Path to the setting file (JSON, JSON5, YAML, or TOML; default: ktzm-setting.{json,json5,yaml,toml} next to the template)")
  .option("--input <file>", "Path to the input data file (JSON, JSON5, YAML, or TOML)")
  .argument("<template-file>", "Template file or directory")
  .argument("<output-file>", "Output file or directory")
  .action(async (templateFile: string, outputFile: string, options: { setting?: string; input?: string }) => {
    await runGenerate({
      ...(options.setting !== undefined ? { setting: options.setting } : {}),
      ...(options.input !== undefined ? { input: options.input } : {}),
      templatePath: templateFile,
      outputPath: outputFile,
    });
  });

// ---------------------------------------------------------------------------
// transpile
// ---------------------------------------------------------------------------
program
  .command("transpile")
  .description("Convert a template file to a transpiled file (TypeScript)")
  .option("--setting <file>", "Path to the setting file (JSON, JSON5, YAML, or TOML; default: ktzm-setting.{json,json5,yaml,toml} next to the template)")
  .option("--input <file>", "Path to the input data file (JSON, JSON5, YAML, or TOML)")
  .option("--runtime <file>", "Output path for the runtime file (default: ktzm-runtime.ts next to the transpiled file)")
  .option("--session <file>", "Output path for the session file (default: ktzm-session.json next to the transpiled file)")
  .option("--force", "Skip confirmation prompt when the output path already exists")
  .argument("<template-file>", "Template file or directory")
  .argument("[output-transpiled-file]", "Output transpiled file or directory (default: <template-file>.ts)")
  .action(async (
    templateFile: string,
    outputFile: string | undefined,
    options: { setting?: string; input?: string; runtime?: string; session?: string; force?: boolean }
  ) => {
    await runTranspile({
      ...(options.setting !== undefined ? { setting: options.setting } : {}),
      ...(options.input !== undefined ? { input: options.input } : {}),
      ...(options.runtime !== undefined ? { runtime: options.runtime } : {}),
      ...(options.session !== undefined ? { session: options.session } : {}),
      templatePath: templateFile,
      ...(outputFile !== undefined ? { outputPath: outputFile } : {}),
      ...(options.force ? { force: true } : {}),
    });
  });

// ---------------------------------------------------------------------------
// detranspile
// ---------------------------------------------------------------------------
program
  .command("detranspile")
  .description("Convert a transpiled file back to the original template using a transpile session")
  .option("--force", "Skip confirmation prompt when overwriting the original template")
  .argument("<session-file>", "Transpile session file (ktzm-session.json) or directory containing it")
  .argument("[output-path]", "Output template file or directory (default: original template path stored in session)")
  .action(async (
    sessionFile: string,
    outputPath: string | undefined,
    options: { force?: boolean }
  ) => {
    await runDetranspile({
      sessionPath: sessionFile,
      ...(outputPath !== undefined ? { outputPath } : {}),
      ...(options.force ? { force: true } : {}),
    });
  });

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err instanceof KatazomeError) {
    process.stderr.write(`ktzm: error: ${err.message}\n`);
    process.exit(1);
  }
  // Re-throw unexpected errors.
  throw err;
}

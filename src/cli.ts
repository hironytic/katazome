#!/usr/bin/env bun
import { Command } from "commander";
import { runGenerate } from "./commands/generate.ts";
import { runTranspile } from "./commands/transpile.ts";
import { runDetranspile } from "./commands/detranspile.ts";
import { KatazomeError } from "./errors.ts";

const program = new Command();

program
  .name("ktzm")
  .description("Generate source files from TypeScript templates")
  .version("0.1.0");

// ---------------------------------------------------------------------------
// generate
// ---------------------------------------------------------------------------
program
  .command("generate")
  .description("Transpile and render a template to produce a final output file")
  .requiredOption("--setting <file>", "Path to the setting file (JSON or JSON5)")
  .option("--input <file>", "Path to the input data file (JSON or JSON5)")
  .argument("<template-file>", "Template file or directory")
  .argument("<output-file>", "Output file or directory")
  .action(async (templateFile: string, outputFile: string, options: { setting: string; input?: string }) => {
    await runGenerate({
      setting: options.setting,
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
  .requiredOption("--setting <file>", "Path to the setting file (JSON or JSON5)")
  .option("--input <file>", "Path to the input data file (JSON or JSON5; unused but accepted for consistency)")
  .option("--runtime <file>", "Output path for the runtime file (default: ktzm-runtime.ts next to the transpiled file)")
  .argument("<template-file>", "Template file or directory")
  .argument("[output-transpiled-file]", "Output transpiled file or directory (default: <template-file>.ts)")
  .action(async (
    templateFile: string,
    outputFile: string | undefined,
    options: { setting: string; input?: string; runtime?: string }
  ) => {
    await runTranspile({
      setting: options.setting,
      ...(options.input !== undefined ? { input: options.input } : {}),
      ...(options.runtime !== undefined ? { runtime: options.runtime } : {}),
      templatePath: templateFile,
      ...(outputFile !== undefined ? { outputPath: outputFile } : {}),
    });
  });

// ---------------------------------------------------------------------------
// detranspile
// ---------------------------------------------------------------------------
program
  .command("detranspile")
  .description("Convert a transpiled file back to the original template")
  .requiredOption("--setting <file>", "Path to the setting file (JSON or JSON5)")
  .argument("<transpiled-file>", "Transpiled file or directory")
  .argument("[output-template-file]", "Output template file or directory (default: <transpiled-file> without .ts)")
  .action(async (
    transpilateFile: string,
    outputFile: string | undefined,
    options: { setting: string }
  ) => {
    await runDetranspile({
      setting: options.setting,
      transpilatePath: transpilateFile,
      ...(outputFile !== undefined ? { outputPath: outputFile } : {}),
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

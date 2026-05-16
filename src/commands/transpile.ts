import { resolve, dirname, join, basename } from "node:path";
import { writeFileSync, statSync, existsSync, rmSync } from "node:fs";
import { loadSetting } from "../config/loader.ts";
import { loadInput } from "../input/loader.ts";
import { tokenize } from "../core/tokenizer.ts";
import { transpileTokens } from "../core/transpiler.ts";
import { generateRuntimeContent } from "../runtime/content.ts";
import { walkDirectory } from "../fs/walker.ts";
import {
  assertNotSamePath,
  getTagDefForFile,
  isExcluded,
  isOutputDirectory,
  askConfirmation,
  ensureDir,
  computeRuntimeImportPath,
  resolveImports,
  resolveSettingPath,
} from "./utils.ts";
import { KatazomeError } from "../errors.ts";
import { writeSession, type TranspileSession } from "../session.ts";
import { CLI_VERSION } from "../version.ts";
import { parseCliAnswers, resolveAnswers } from "../questions/resolver.ts";

export interface TranspileOptions {
  setting?: string;
  input?: string;
  answers?: string[];
  runtime?: string;
  session?: string;
  templatePath: string;
  outputPath?: string;
  force?: boolean;
}

/**
 * Runs the `transpile` command: converts a template file (or directory) to transpilate(s).
 */
export async function runTranspile(options: TranspileOptions): Promise<void> {
  const settingPath = resolveSettingPath(options.setting, options.templatePath);
  const setting = await loadSetting(settingPath);
  const inputData = options.input !== undefined ? await loadInput(options.input) : {};

  const cliAnswers = parseCliAnswers(options.answers ?? []);
  const isInteractive = process.stdin.isTTY === true;

  const templateAbs = resolve(options.templatePath);
  const settingAbs = resolve(settingPath);
  const settingDir = dirname(settingAbs);
  const isTemplateDir = existsSync(templateAbs) && statSync(templateAbs).isDirectory();
  const isOutputDir = options.outputPath !== undefined && isOutputDirectory(options.outputPath);

  if (isTemplateDir) {
    if (options.outputPath === undefined) {
      throw new KatazomeError(
        "Output path is required when the input is a directory."
      );
    }
    const outputAbs = resolve(options.outputPath);
    assertNotSamePath(templateAbs, outputAbs);

    // Confirm before overwriting an existing output directory.
    if (existsSync(outputAbs)) {
      if (!options.force) {
        const confirmed = await askConfirmation(
          `Output directory "${outputAbs}" already exists and will be deleted. Continue?`
        );
        if (!confirmed) {
          process.stderr.write("Aborted.\n");
          return;
        }
      }
      rmSync(outputAbs, { recursive: true });
    }

    const answerData = await resolveAnswers(setting.questions ?? [], cliAnswers, isInteractive);

    // Determine runtime path: --runtime or <outputDir>/ktzm-runtime.ts
    const runtimePath = options.runtime
      ? resolve(options.runtime)
      : join(outputAbs, "ktzm-runtime.ts");

    ensureDir(runtimePath);
    writeFileSync(runtimePath, generateRuntimeContent(inputData, answerData, { kind: "stdout" }), "utf-8");

    const files = walkDirectory(templateAbs);
    for (const file of files) {
      if (file.absolutePath === settingAbs) continue;
      if (isExcluded(setting, basename(file.absolutePath))) continue;
      const outRelPath = `${file.relativePath}.ts`;
      const outAbsPath = join(outputAbs, outRelPath);
      if (outAbsPath === settingAbs) {
        throw new KatazomeError(
          `Output path conflicts with the setting file: "${outAbsPath}"`
        );
      }
      assertNotSamePath(file.absolutePath, outAbsPath);
      try {
        await transpileFile(
          file.absolutePath,
          outAbsPath,
          runtimePath,
          setting,
          settingDir,
        );
      } catch (err) {
        if (err instanceof KatazomeError) {
          throw new KatazomeError(`${file.relativePath}: ${err.message}`);
        }
        throw err;
      }
    }

    // Write session file after all files are transpiled.
    const sessionPath = options.session
      ? resolve(options.session)
      : join(outputAbs, "ktzm-session.json");
    const sessionData: TranspileSession = {
      version: CLI_VERSION,
      settingFile: settingAbs,
      templatePath: templateAbs,
      transpilatePath: outputAbs,
      files: files
        .filter((f) => f.absolutePath !== settingAbs)
        .filter((f) => !isExcluded(setting, basename(f.absolutePath)))
        .map((f) => ({ relativePath: f.relativePath })),
    };
    writeSession(sessionPath, sessionData);
  } else {
    // Single file input (directory output or file output)

    // Determine output paths based on mode.
    let outputFileAbs: string;
    let outputDirAbs: string;
    if (isOutputDir) {
      outputDirAbs = resolve(options.outputPath!);
      outputFileAbs = join(outputDirAbs, `${basename(templateAbs)}.ts`);
    } else {
      outputFileAbs = options.outputPath
        ? resolve(options.outputPath)
        : `${templateAbs}.ts`;
      outputDirAbs = dirname(outputFileAbs);
    }

    if (templateAbs === settingAbs) {
      throw new KatazomeError(
        `The template file is the same as the setting file: "${templateAbs}"`
      );
    }
    if (outputFileAbs === settingAbs) {
      throw new KatazomeError(
        `Output path conflicts with the setting file: "${outputFileAbs}"`
      );
    }
    assertNotSamePath(templateAbs, outputFileAbs);

    // Confirm before overwriting an existing output file.
    if (existsSync(outputFileAbs)) {
      if (!options.force) {
        const confirmed = await askConfirmation(
          `Output file "${outputFileAbs}" already exists. Overwrite?`
        );
        if (!confirmed) {
          process.stderr.write("Aborted.\n");
          return;
        }
      }
    }

    const answerData = await resolveAnswers(setting.questions ?? [], cliAnswers, isInteractive);

    // Determine runtime path: --runtime or <outputDir>/ktzm-runtime.ts
    const runtimePath = options.runtime
      ? resolve(options.runtime)
      : join(outputDirAbs, "ktzm-runtime.ts");

    ensureDir(runtimePath);
    writeFileSync(runtimePath, generateRuntimeContent(inputData, answerData, { kind: "stdout" }), "utf-8");

    await transpileFile(
      templateAbs,
      outputFileAbs,
      runtimePath,
      setting,
      settingDir,
    );

    // Write session file after transpilation.
    const sessionPath = options.session
      ? resolve(options.session)
      : join(outputDirAbs, "ktzm-session.json");
    const sessionData: TranspileSession = {
      version: CLI_VERSION,
      settingFile: settingAbs,
      templatePath: templateAbs,
      transpilatePath: outputFileAbs,
      files: [{ relativePath: "" }],
    };
    writeSession(sessionPath, sessionData);
  }
}

async function transpileFile(
  templatePath: string,
  outputPath: string,
  runtimePath: string,
  setting: ReturnType<typeof loadSetting> extends Promise<infer T> ? T : never,
  settingDir: string,
): Promise<void> {
  const filename = basename(templatePath);
  const tagDef = getTagDefForFile(setting, filename);

  let templateContent: string;
  try {
    templateContent = await Bun.file(templatePath).text();
  } catch {
    throw new KatazomeError(`Cannot read template file: "${templatePath}"`);
  }

  const tokens = tokenize(templateContent, tagDef);
  const importPath = computeRuntimeImportPath(outputPath, runtimePath);
  const userImports = resolveImports(setting, filename, settingDir);
  const transpilate = transpileTokens(tokens, importPath, userImports);

  ensureDir(outputPath);
  writeFileSync(outputPath, transpilate, "utf-8");
}

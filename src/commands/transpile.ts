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
  askConfirmation,
  ensureDir,
  computeRuntimeImportPath,
  resolveSettingPath,
} from "./utils.ts";
import { KatazomeError } from "../errors.ts";
import { writeSession, type TranspileSession } from "../session.ts";
import { CLI_VERSION } from "../version.ts";

export interface TranspileOptions {
  setting?: string;
  input?: string;
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

  const templateAbs = resolve(options.templatePath);
  const settingAbs = resolve(settingPath);
  const isDirectory = existsSync(templateAbs) && statSync(templateAbs).isDirectory();

  if (isDirectory) {
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

    // Determine runtime path: --runtime or <outputDir>/ktzm-runtime.ts
    const runtimePath = options.runtime
      ? resolve(options.runtime)
      : join(outputAbs, "ktzm-runtime.ts");

    ensureDir(runtimePath);
    writeFileSync(runtimePath, generateRuntimeContent(inputData), "utf-8");

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
      await transpileFile(
        file.absolutePath,
        outAbsPath,
        runtimePath,
        setting,
        file.relativePath
      );
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
    // Single file
    const outputAbs = options.outputPath
      ? resolve(options.outputPath)
      : `${templateAbs}.ts`;

    if (templateAbs === settingAbs) {
      throw new KatazomeError(
        `The template file is the same as the setting file: "${templateAbs}"`
      );
    }
    if (outputAbs === settingAbs) {
      throw new KatazomeError(
        `Output path conflicts with the setting file: "${outputAbs}"`
      );
    }
    assertNotSamePath(templateAbs, outputAbs);

    // Confirm before overwriting an existing output file.
    if (existsSync(outputAbs)) {
      if (!options.force) {
        const confirmed = await askConfirmation(
          `Output file "${outputAbs}" already exists. Overwrite?`
        );
        if (!confirmed) {
          process.stderr.write("Aborted.\n");
          return;
        }
      }
    }

    // Determine runtime path: --runtime or same dir as transpiled file
    const runtimePath = options.runtime
      ? resolve(options.runtime)
      : join(dirname(outputAbs), "ktzm-runtime.ts");

    ensureDir(runtimePath);
    writeFileSync(runtimePath, generateRuntimeContent(inputData), "utf-8");

    await transpileFile(
      templateAbs,
      outputAbs,
      runtimePath,
      setting,
      basename(options.templatePath)
    );

    // Write session file after transpilation.
    const sessionPath = options.session
      ? resolve(options.session)
      : join(dirname(outputAbs), "ktzm-session.json");
    const sessionData: TranspileSession = {
      version: CLI_VERSION,
      settingFile: settingAbs,
      templatePath: templateAbs,
      transpilatePath: outputAbs,
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
  displayName: string
): Promise<void> {
  const tagDef = getTagDefForFile(setting, basename(templatePath));

  let templateContent: string;
  try {
    templateContent = await Bun.file(templatePath).text();
  } catch {
    throw new KatazomeError(`Cannot read template file: "${templatePath}"`);
  }

  const tokens = tokenize(templateContent, tagDef);
  const importPath = computeRuntimeImportPath(outputPath, runtimePath);
  const transpilate = transpileTokens(tokens, importPath);

  ensureDir(outputPath);
  writeFileSync(outputPath, transpilate, "utf-8");
}

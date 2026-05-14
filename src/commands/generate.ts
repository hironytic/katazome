import { resolve, join, basename, dirname } from "node:path";
import { mkdirSync, statSync, existsSync } from "node:fs";
import { loadSetting } from "../config/loader.ts";
import { loadInput } from "../input/loader.ts";
import { tokenize } from "../core/tokenizer.ts";
import { transpileTokens } from "../core/transpiler.ts";
import { render, type RenderOutput } from "../core/renderer.ts";
import { walkDirectory } from "../fs/walker.ts";
import {
  assertNotSamePath,
  getTagDefForFile,
  getExistingFileBehavior,
  isExcluded,
  isOutputDirectory,
  askExistingFileAction,
  ensureDir,
  resolveImports,
  resolveSettingPath,
} from "./utils.ts";
import { KatazomeError } from "../errors.ts";
import { parseCliAnswers, resolveAnswers } from "../questions/resolver.ts";

export interface GenerateOptions {
  setting?: string;
  input?: string;
  answers?: string[];
  templatePath: string;
  outputPath: string;
}

/**
 * Runs the `generate` command: renders a template file (or directory) to the final output.
 */
export async function runGenerate(options: GenerateOptions): Promise<void> {
  const settingPath = resolveSettingPath(options.setting, options.templatePath);
  const setting = await loadSetting(settingPath);
  const inputData = options.input !== undefined ? await loadInput(options.input) : {};

  const cliAnswers = parseCliAnswers(options.answers ?? []);
  const isInteractive = process.stdin.isTTY === true;
  const answerData = await resolveAnswers(setting.questions ?? [], cliAnswers, isInteractive);

  const templateAbs = resolve(options.templatePath);
  const settingAbs = resolve(settingPath);
  const settingDir = dirname(settingAbs);
  const outputAbs = resolve(options.outputPath);
  const isTemplateDir = existsSync(templateAbs) && statSync(templateAbs).isDirectory();
  const isOutputDir = isOutputDirectory(options.outputPath);

  if (!isOutputDir && isTemplateDir) {
    throw new KatazomeError(
      `Cannot use a directory as template input with a file output path: "${outputAbs}". Specify a directory as the output path.`
    );
  }

  assertNotSamePath(templateAbs, outputAbs);

  if (isOutputDir) {
    const files = isTemplateDir
      ? walkDirectory(templateAbs)
      : [{ absolutePath: templateAbs, relativePath: basename(templateAbs) }];

    for (const file of files) {
      if (file.absolutePath === settingAbs) continue;
      if (isExcluded(setting, basename(file.absolutePath))) continue;
      const outAbsPath = join(outputAbs, file.relativePath);
      if (outAbsPath === settingAbs) {
        throw new KatazomeError(
          `Output path conflicts with the setting file: "${outAbsPath}"`
        );
      }
      assertNotSamePath(file.absolutePath, outAbsPath);
      try {
        await generateFile(
          file.absolutePath,
          { kind: "directory", outputDir: outputAbs, initialRelativePath: file.relativePath },
          setting,
          inputData,
          answerData,
          file.relativePath,
          settingDir,
        );
      } catch (err) {
        if (err instanceof KatazomeError) {
          throw new KatazomeError(`${file.relativePath}: ${err.message}`);
        }
        throw err;
      }
    }
  } else {
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
    await generateFile(
      templateAbs,
      { kind: "file", outputFilePath: outputAbs, initialRelativePath: basename(options.templatePath) },
      setting,
      inputData,
      answerData,
      basename(options.templatePath),
      settingDir,
    );
  }
}

async function generateFile(
  templatePath: string,
  output: RenderOutput,
  setting: ReturnType<typeof loadSetting> extends Promise<infer T> ? T : never,
  inputData: unknown,
  answerData: unknown,
  displayName: string,
  settingDir: string,
): Promise<void> {
  const filename = basename(templatePath);
  const tagDef = getTagDefForFile(setting, filename);

  // For existingFile checks in directory mode, use the initial output path.
  const checkPath = output.kind === "file"
    ? output.outputFilePath
    : join(output.outputDir, output.initialRelativePath);

  const behavior = getExistingFileBehavior(setting, filename);
  if (behavior !== "overwrite" && existsSync(checkPath)) {
    if (behavior === "error") {
      throw new KatazomeError(
        `Output file already exists: "${checkPath}". Use a different existingFile setting to allow overwriting or skipping.`
      );
    }
    if (behavior === "skip") return;
    if (behavior === "prompt") {
      const action = await askExistingFileAction(displayName);
      if (action === "skip") return;
      if (action === "error") {
        throw new KatazomeError(
          `Output file already exists: "${checkPath}".`
        );
      }
    }
  }

  let templateContent: string;
  try {
    templateContent = await Bun.file(templatePath).text();
  } catch {
    throw new KatazomeError(`Cannot read template file: "${templatePath}"`);
  }

  const tokens = tokenize(templateContent, tagDef);
  const userImports = resolveImports(setting, filename, settingDir);
  // For generate, the runtime import path doesn't matter (temp files in same dir).
  const transpilate = transpileTokens(tokens, "./ktzm-runtime.ts", userImports);

  if (output.kind === "file") {
    ensureDir(output.outputFilePath);
  } else {
    mkdirSync(output.outputDir, { recursive: true });
  }
  await render(transpilate, inputData, answerData, output);
}

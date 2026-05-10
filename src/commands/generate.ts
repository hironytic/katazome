import { resolve, join, basename, dirname } from "node:path";
import { statSync, existsSync } from "node:fs";
import { loadSetting } from "../config/loader.ts";
import { loadInput } from "../input/loader.ts";
import { tokenize } from "../core/tokenizer.ts";
import { transpileTokens } from "../core/transpiler.ts";
import { render } from "../core/renderer.ts";
import { walkDirectory } from "../fs/walker.ts";
import {
  assertNotSamePath,
  getTagDefForFile,
  getExistingFileBehavior,
  isExcluded,
  askExistingFileAction,
  ensureDir,
  resolveImports,
  resolveSettingPath,
} from "./utils.ts";
import { KatazomeError } from "../errors.ts";

export interface GenerateOptions {
  setting?: string;
  input?: string;
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

  const templateAbs = resolve(options.templatePath);
  const settingAbs = resolve(settingPath);
  const settingDir = dirname(settingAbs);
  const outputAbs = resolve(options.outputPath);
  const isDirectory = existsSync(templateAbs) && statSync(templateAbs).isDirectory();

  assertNotSamePath(templateAbs, outputAbs);

  if (isDirectory) {
    const files = walkDirectory(templateAbs);
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
      await generateFile(
        file.absolutePath,
        outAbsPath,
        setting,
        inputData,
        file.relativePath,
        settingDir,
      );
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
      outputAbs,
      setting,
      inputData,
      basename(options.templatePath),
      settingDir,
    );
  }
}

async function generateFile(
  templatePath: string,
  outputPath: string,
  setting: ReturnType<typeof loadSetting> extends Promise<infer T> ? T : never,
  inputData: unknown,
  displayName: string,
  settingDir: string,
): Promise<void> {
  const filename = basename(templatePath);
  const tagDef = getTagDefForFile(setting, filename);

  const behavior = getExistingFileBehavior(setting, filename);
  if (behavior !== "overwrite" && existsSync(outputPath)) {
    if (behavior === "error") {
      throw new KatazomeError(
        `Output file already exists: "${outputPath}". Use a different existingFile setting to allow overwriting or skipping.`
      );
    }
    if (behavior === "skip") return;
    if (behavior === "prompt") {
      const action = await askExistingFileAction(displayName);
      if (action === "skip") return;
      if (action === "error") {
        throw new KatazomeError(
          `Output file already exists: "${outputPath}".`
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

  ensureDir(outputPath);
  await render(transpilate, inputData, outputPath);
}

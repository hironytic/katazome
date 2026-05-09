import { resolve, join, basename } from "node:path";
import { statSync, existsSync } from "node:fs";
import { loadSetting } from "../config/loader.ts";
import { loadInput } from "../input/loader.ts";
import { tokenize } from "../core/tokenizer.ts";
import { transpileTokens } from "../core/transpiler.ts";
import { render } from "../core/renderer.ts";
import { walkDirectory } from "../fs/walker.ts";
import {
  assertNotSamePath,
  getTagDefForExtension,
  getExtension,
  ensureDir,
} from "./utils.ts";
import { KatazomeError } from "../errors.ts";

export interface GenerateOptions {
  setting: string;
  input?: string;
  templatePath: string;
  outputPath: string;
}

/**
 * Runs the `generate` command: renders a template file (or directory) to the final output.
 */
export async function runGenerate(options: GenerateOptions): Promise<void> {
  const setting = await loadSetting(options.setting);
  const inputData = options.input !== undefined ? await loadInput(options.input) : {};

  const templateAbs = resolve(options.templatePath);
  const outputAbs = resolve(options.outputPath);
  const isDirectory = existsSync(templateAbs) && statSync(templateAbs).isDirectory();

  assertNotSamePath(templateAbs, outputAbs);

  if (isDirectory) {
    const files = walkDirectory(templateAbs);
    for (const file of files) {
      const outAbsPath = join(outputAbs, file.relativePath);
      assertNotSamePath(file.absolutePath, outAbsPath);
      await generateFile(
        file.absolutePath,
        outAbsPath,
        setting,
        inputData,
        file.relativePath
      );
    }
  } else {
    await generateFile(
      templateAbs,
      outputAbs,
      setting,
      inputData,
      basename(options.templatePath)
    );
  }
}

async function generateFile(
  templatePath: string,
  outputPath: string,
  setting: ReturnType<typeof loadSetting> extends Promise<infer T> ? T : never,
  inputData: unknown,
  displayName: string
): Promise<void> {
  const ext = getExtension(templatePath);
  if (ext === undefined) {
    throw new KatazomeError(
      `Cannot determine extension for file "${displayName}". Files must have an extension.`
    );
  }

  const tagDef = getTagDefForExtension(setting, ext);

  let templateContent: string;
  try {
    templateContent = await Bun.file(templatePath).text();
  } catch {
    throw new KatazomeError(`Cannot read template file: "${templatePath}"`);
  }

  const tokens = tokenize(templateContent, tagDef);
  // For generate, the runtime import path doesn't matter (temp files in same dir).
  const transpilate = transpileTokens(tokens, "./ktzm-runtime.ts");

  ensureDir(outputPath);
  await render(transpilate, inputData, outputPath);
}

import { resolve, join, basename, dirname } from "node:path";
import { writeFileSync, statSync, existsSync } from "node:fs";
import { loadSetting } from "../config/loader.ts";
import { detranspile } from "../core/detranspiler.ts";
import { walkDirectory } from "../fs/walker.ts";
import {
  assertNotSamePath,
  getTagDefForExtension,
  getExtension,
  ensureDir,
} from "./utils.ts";
import { KatazomeError } from "../errors.ts";

export interface DetranspileOptions {
  setting: string;
  transpilatePath: string;
  outputPath?: string;
}

/**
 * Runs the `detranspile` command: converts transpilate file(s) back to template(s).
 */
export async function runDetranspile(options: DetranspileOptions): Promise<void> {
  const setting = await loadSetting(options.setting);

  const inputAbs = resolve(options.transpilatePath);
  const isDirectory = existsSync(inputAbs) && statSync(inputAbs).isDirectory();

  if (isDirectory) {
    if (options.outputPath === undefined) {
      throw new KatazomeError(
        "Output path is required when the input is a directory."
      );
    }
    const outputAbs = resolve(options.outputPath);
    assertNotSamePath(inputAbs, outputAbs);

    const files = walkDirectory(inputAbs);
    for (const file of files) {
      // Strip .ts from the relative path to get the output file name.
      if (!file.relativePath.endsWith(".ts")) {
        throw new KatazomeError(
          `File "${file.relativePath}" in input directory does not end with ".ts". ` +
          `Only .ts files (transpiled files) are expected.`
        );
      }
      const outRelPath = file.relativePath.slice(0, -3); // remove ".ts"
      const outAbsPath = join(outputAbs, outRelPath);
      assertNotSamePath(file.absolutePath, outAbsPath);
      await detranspileFile(file.absolutePath, outAbsPath, setting, file.relativePath);
    }
  } else {
    // Single file
    const outputAbs = options.outputPath
      ? resolve(options.outputPath)
      : computeDefaultOutputPath(inputAbs);

    assertNotSamePath(inputAbs, outputAbs);
    await detranspileFile(inputAbs, outputAbs, setting, basename(options.transpilatePath));
  }
}

/**
 * For a transpilate file `foo.c.ts`, the default output is `foo.c` in the same directory.
 */
function computeDefaultOutputPath(transpilatePath: string): string {
  const dir = dirname(transpilatePath);
  const name = basename(transpilatePath);
  if (!name.endsWith(".ts")) {
    throw new KatazomeError(
      `Cannot determine default output path for "${transpilatePath}": does not end with ".ts".`
    );
  }
  return join(dir, name.slice(0, -3));
}

async function detranspileFile(
  transpilatePath: string,
  outputPath: string,
  setting: ReturnType<typeof loadSetting> extends Promise<infer T> ? T : never,
  displayName: string
): Promise<void> {
  // The extension of the original template is the transpilate name without ".ts".
  // e.g. "main.c.ts" → original ext is "c"
  const nameWithoutTs = displayName.endsWith(".ts")
    ? displayName.slice(0, -3)
    : displayName;

  const ext = getExtension(nameWithoutTs);
  if (ext === undefined) {
    throw new KatazomeError(
      `Cannot determine original extension from transpiled file name "${displayName}".`
    );
  }

  const tagDef = getTagDefForExtension(setting, ext, displayName);

  let transpilateContent: string;
  try {
    transpilateContent = await Bun.file(transpilatePath).text();
  } catch {
    throw new KatazomeError(`Cannot read transpiled file: "${transpilatePath}"`);
  }

  const template = detranspile(transpilateContent, tagDef);

  ensureDir(outputPath);
  writeFileSync(outputPath, template, "utf-8");
}

import { resolve, dirname, relative } from "node:path";
import { mkdirSync } from "node:fs";
import { KatazomeError } from "../errors.ts";
import type { ExtensionTagDefinition, Setting } from "../types.ts";

/**
 * Resolves two paths to absolute and checks they are not the same.
 * Throws KatazomeError if they are equal.
 */
export function assertNotSamePath(inputPath: string, outputPath: string): void {
  const absIn = resolve(inputPath);
  const absOut = resolve(outputPath);
  if (absIn === absOut) {
    throw new KatazomeError(
      `Input and output paths must be different: "${absIn}"`
    );
  }
}

/**
 * Returns the tag definition for the given file extension.
 * Throws KatazomeError if the extension is not defined in settings.
 */
export function getTagDefForExtension(
  setting: Setting,
  ext: string,
  filePath: string
): ExtensionTagDefinition {
  const tagDef = setting.tagDefinition[ext];
  if (tagDef === undefined) {
    throw new KatazomeError(
      `No tag definition found for extension ".${ext}" (file: "${filePath}"). ` +
      `Add it to the setting file.`
    );
  }
  return tagDef;
}

/**
 * Extracts the extension (without leading dot) from a filename.
 * Returns undefined if the filename has no extension.
 */
export function getExtension(filePath: string): string | undefined {
  const name = filePath.split("/").pop() ?? filePath;
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) return undefined;
  return name.slice(dotIndex + 1);
}

/**
 * Ensures the directory for the given file path exists, creating it if necessary.
 */
export function ensureDir(filePath: string): void {
  mkdirSync(dirname(resolve(filePath)), { recursive: true });
}

/**
 * Computes the relative import path from a transpilate file to the runtime file.
 * The result is always a relative path starting with "./" or "../".
 */
export function computeRuntimeImportPath(
  transpilatePath: string,
  runtimePath: string
): string {
  const rel = relative(dirname(resolve(transpilatePath)), resolve(runtimePath));
  // Ensure the path starts with "./"
  if (rel.startsWith("..") || rel.startsWith("/")) return rel;
  return `./${rel}`;
}

import { resolve, dirname, relative, join } from "node:path";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { KatazomeError } from "../errors.ts";
import type { TagDefinition, Setting } from "../types.ts";

const SETTING_EXTS = ["json", "json5", "yaml", "toml"] as const;
const SETTING_BASE = "ktzm-setting";

/**
 * Resolves the path to the setting file.
 * If settingPath is given, returns it as-is.
 * Otherwise searches for ktzm-setting.{json,json5,yaml,toml} in the same
 * directory as inputPath (treating inputPath as a file) or in inputPath itself
 * (if it is a directory).
 */
export function resolveSettingPath(
  settingPath: string | undefined,
  inputPath: string
): string {
  if (settingPath !== undefined) return settingPath;

  const inputAbs = resolve(inputPath);
  const dir = existsSync(inputAbs) && statSync(inputAbs).isDirectory()
    ? inputAbs
    : dirname(inputAbs);

  for (const ext of SETTING_EXTS) {
    const candidate = join(dir, `${SETTING_BASE}.${ext}`);
    if (existsSync(candidate)) return candidate;
  }

  throw new KatazomeError(
    `Setting file not found. Looked for "${SETTING_BASE}.{json,json5,yaml,toml}" in "${dir}".`
  );
}

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
 * Resolves the effective tag definition for the given file extension.
 * If the extension is not listed in settings, the common definition is used.
 * If inherit is true (default), the common and extension-specific definitions are combined.
 * If inherit is false, only the extension-specific definition is used.
 */
export function getTagDefForExtension(
  setting: Setting,
  ext: string
): TagDefinition {
  const extConfig = setting.extensions[ext.toLowerCase()];

  if (extConfig === undefined) {
    return setting.tagDefinition;
  }

  const extTagDef = extConfig.tagDefinition;

  if (!extTagDef.inherit) {
    return {
      code: extTagDef.code,
      value: extTagDef.value,
      comment: extTagDef.comment,
    };
  }

  return {
    code: [...setting.tagDefinition.code, ...extTagDef.code],
    value: [...setting.tagDefinition.value, ...extTagDef.value],
    comment: [...setting.tagDefinition.comment, ...extTagDef.comment],
  };
}

/**
 * Extracts the extension (without leading dot) from a filename.
 * Returns undefined if the filename has no extension.
 */
export function getExtension(filePath: string): string | undefined {
  const name = filePath.split("/").pop() ?? filePath;
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) return undefined;
  return name.slice(dotIndex + 1).toLowerCase();
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

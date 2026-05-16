import { resolve, dirname, relative, join } from "node:path";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { KatazomeError } from "../errors.ts";
import { askSelect } from "../interactive/prompts.ts";
import type { ExistingFileBehavior, FilePatternConfig, ImportEntry, TagDefinition, Setting } from "../types.ts";

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
 * Returns true if the filename matches the given glob pattern.
 * Only * wildcards are supported; matching is case-insensitive.
 * The pattern is matched against the filename only (not the path).
 */
export function matchPattern(filename: string, pattern: string): boolean {
  const escaped = pattern
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(filename.toLowerCase());
}

/**
 * Finds the first FilePatternConfig whose pattern matches the given filename.
 * Exact patterns (no wildcard) take priority over wildcard patterns.
 * Among wildcard patterns, the first match in array order wins.
 */
export function findFilePatternConfig(
  setting: Setting,
  filename: string
): FilePatternConfig | undefined {
  // Exact match first (pattern contains no wildcard)
  const exact = setting.files.find(
    (f) => !f.pattern.includes("*") && matchPattern(filename, f.pattern)
  );
  if (exact !== undefined) return exact;

  // Wildcard: first match wins
  return setting.files.find(
    (f) => f.pattern.includes("*") && matchPattern(filename, f.pattern)
  );
}

/**
 * Resolves the effective tag definition for the given filename.
 * If no file pattern matches, the common definition is used.
 * If inherit is true (default), the common and pattern-specific definitions are combined.
 * If inherit is false, only the pattern-specific definition is used.
 */
export function getTagDefForFile(
  setting: Setting,
  filename: string
): TagDefinition {
  const fileConfig = findFilePatternConfig(setting, filename);

  if (fileConfig === undefined) {
    return setting.tagDefinition;
  }

  const fileTagDef = fileConfig.tagDefinition;

  if (!fileTagDef.inherit) {
    return {
      code: fileTagDef.code,
      value: fileTagDef.value,
      comment: fileTagDef.comment,
    };
  }

  return {
    code: [...setting.tagDefinition.code, ...fileTagDef.code],
    value: [...setting.tagDefinition.value, ...fileTagDef.value],
    comment: [...setting.tagDefinition.comment, ...fileTagDef.comment],
  };
}

/**
 * Returns the effective ExistingFileBehavior for the given filename.
 * Falls back to the root-level setting, then to "overwrite".
 */
export function getExistingFileBehavior(
  setting: Setting,
  filename: string
): ExistingFileBehavior {
  const fileConfig = findFilePatternConfig(setting, filename);
  return fileConfig?.existingFile ?? setting.existingFile ?? "overwrite";
}

/**
 * Returns true if the filename matches any pattern in setting.exclude.
 */
export function isExcluded(setting: Setting, filename: string): boolean {
  return setting.exclude.some((pattern) => matchPattern(filename, pattern));
}

/**
 * Returns true if the given output path should be treated as a directory target.
 * A path is a directory target if it ends with "/" or if it points to an existing directory.
 */
export function isOutputDirectory(outputPath: string): boolean {
  if (outputPath.endsWith("/")) return true;
  const abs = resolve(outputPath);
  return existsSync(abs) && statSync(abs).isDirectory();
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

/**
 * Resolves the effective import entries for the given filename, with absolute paths.
 * Applies root-level imports and file-pattern-level imports according to the inherit flag.
 */
export function resolveImports(
  setting: Setting,
  filename: string,
  settingDir: string
): Array<{ path: string; as: string }> {
  const toAbs = (e: ImportEntry) => ({
    path: resolve(settingDir, e.path),
    as: e.as,
  });

  const rootImports = (setting.imports?.paths ?? []).map(toAbs);

  const fileConfig = findFilePatternConfig(setting, filename);
  if (fileConfig?.imports === undefined) return rootImports;

  const fileImports = fileConfig.imports.paths.map(toAbs);

  return fileConfig.imports.inherit
    ? [...rootImports, ...fileImports]
    : fileImports;
}

/**
 * Prompts the user with a yes/no question and returns true if the answer is "y".
 */
export async function askConfirmation(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

/**
 * Prompts the user to choose how to handle an existing output file.
 * Returns "overwrite", "skip", or "error".
 * Default (Enter) is "skip".
 */
export async function askExistingFileAction(
  displayName: string
): Promise<"overwrite" | "skip" | "error"> {
  const options = [
    { label: "Skip", value: "skip" as const },
    { label: "Overwrite", value: "overwrite" as const },
    { label: "Error", value: "error" as const },
  ];
  return await askSelect(
    `"${displayName}" already exists. What would you like to do?`,
    options,
    0,
  ) as "overwrite" | "skip" | "error";
}

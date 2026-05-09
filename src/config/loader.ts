import { readAndParse } from "../utils/file-parser.ts";
import type {
  ExtensionConfig,
  ExtensionTagDefinitionConfig,
  Setting,
  TagDefinition,
  TagTypeDefinition,
} from "../types.ts";
import { KatazomeError } from "../errors.ts";

/**
 * Loads and validates a setting file.
 * Supported formats: .json, .json5, .yaml, .yml, .toml
 * Files with unknown or no extension are parsed as JSON5.
 */
export async function loadSetting(filePath: string): Promise<Setting> {
  const parsed = await readAndParse(filePath, "setting file");
  return validateSetting(parsed, filePath);
}

function validateSetting(value: unknown, filePath: string): Setting {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(`Setting file "${filePath}" must be a JSON object.`);
  }

  const obj = value as Record<string, unknown>;

  warnUnknownKeys(obj, ["tagDefinition", "extensions"], filePath, "");

  const tagDefinition = validateCommonTagDefinition(obj["tagDefinition"], filePath);
  const extensions = validateExtensionsMap(obj["extensions"], filePath);

  // Duplicate start string check for each extension's resolved definition.
  for (const [ext, extConfig] of Object.entries(extensions)) {
    const extTagDef = extConfig.tagDefinition;
    checkDuplicateStarts(extTagDef, ext, filePath);

    if (extTagDef.inherit) {
      // Also check the combined (common + extension) definition.
      const combined: TagDefinition = {
        code: [...tagDefinition.code, ...extTagDef.code],
        value: [...tagDefinition.value, ...extTagDef.value],
        comment: [...tagDefinition.comment, ...extTagDef.comment],
      };
      checkDuplicateStarts(combined, ext, filePath, "(combined with common tagDefinition)");
    }
  }

  return { tagDefinition, extensions };
}

function validateCommonTagDefinition(value: unknown, filePath: string): TagDefinition {
  if (value === undefined) {
    return { code: [], value: [], comment: [] };
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": "tagDefinition" must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;
  warnUnknownKeys(obj, ["code", "value", "comment"], filePath, `tagDefinition`);

  const result: TagDefinition = {
    code: parseTagTypeDefinitions(obj["code"], filePath, `tagDefinition.code`),
    value: parseTagTypeDefinitions(obj["value"], filePath, `tagDefinition.value`),
    comment: parseTagTypeDefinitions(obj["comment"], filePath, `tagDefinition.comment`),
  };

  checkDuplicateStarts(result, undefined, filePath);

  return result;
}

function validateExtensionsMap(
  value: unknown,
  filePath: string
): Record<string, ExtensionConfig> {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": "extensions" must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, ExtensionConfig> = {};

  for (const [rawKey, extValue] of Object.entries(obj)) {
    const key = rawKey.toLowerCase();
    if (key in result) {
      throw new KatazomeError(
        `Setting file "${filePath}": duplicate extension key "${key}" (after lowercasing).`
      );
    }
    result[key] = validateExtensionConfig(extValue, key, filePath);
  }

  return result;
}

function validateExtensionConfig(
  value: unknown,
  ext: string,
  filePath: string
): ExtensionConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": extensions["${ext}"] must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;
  warnUnknownKeys(obj, ["tagDefinition"], filePath, `extensions["${ext}"]`);

  return {
    tagDefinition: validateExtensionTagDefinitionConfig(
      obj["tagDefinition"],
      ext,
      filePath
    ),
  };
}

function validateExtensionTagDefinitionConfig(
  value: unknown,
  ext: string,
  filePath: string
): ExtensionTagDefinitionConfig {
  const location = `extensions["${ext}"].tagDefinition`;

  if (value === undefined) {
    return { inherit: true, code: [], value: [], comment: [] };
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location} must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;
  warnUnknownKeys(obj, ["inherit", "code", "value", "comment"], filePath, location);

  let inherit = true;
  if ("inherit" in obj) {
    if (typeof obj["inherit"] !== "boolean") {
      throw new KatazomeError(
        `Setting file "${filePath}": ${location}.inherit must be a boolean.`
      );
    }
    inherit = obj["inherit"];
  }

  return {
    inherit,
    code: parseTagTypeDefinitions(obj["code"], filePath, `${location}.code`),
    value: parseTagTypeDefinitions(obj["value"], filePath, `${location}.value`),
    comment: parseTagTypeDefinitions(obj["comment"], filePath, `${location}.comment`),
  };
}

function parseTagTypeDefinitions(
  value: unknown,
  filePath: string,
  location: string
): TagTypeDefinition[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location} must be an array.`
    );
  }

  return value.map((item, i) =>
    validateTagTypeDefinition(item, filePath, `${location}[${i}]`)
  );
}

function validateTagTypeDefinition(
  value: unknown,
  filePath: string,
  location: string
): TagTypeDefinition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location} must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;
  warnUnknownKeys(obj, ["start", "end", "trim"], filePath, location);

  if (typeof obj["start"] !== "string" || obj["start"].length === 0) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location}.start must be a non-empty string.`
    );
  }

  if (typeof obj["end"] !== "string" || obj["end"].length === 0) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location}.end must be a non-empty string.`
    );
  }

  const def: TagTypeDefinition = {
    start: obj["start"],
    end: obj["end"],
  };

  if ("trim" in obj) {
    const trim = obj["trim"];
    if (trim !== "start" && trim !== "end" && trim !== "both" && trim !== "none") {
      throw new KatazomeError(
        `Setting file "${filePath}": ${location}.trim must be "start", "end", "both", or "none".`
      );
    }
    def.trim = trim;
  }

  return def;
}

/**
 * Checks for duplicate start strings within a TagDefinition (across all kinds).
 * Throws KatazomeError on the first duplicate found.
 *
 * @param tagDef   The tag definition to check.
 * @param ext      Extension name for error messages, or undefined for the common definition.
 * @param filePath Setting file path for error messages.
 * @param note     Optional suffix appended to the error message location.
 */
function checkDuplicateStarts(
  tagDef: TagDefinition,
  ext: string | undefined,
  filePath: string,
  note = ""
): void {
  const prefix = ext !== undefined
    ? `extensions["${ext}"].tagDefinition`
    : `tagDefinition`;
  const locationSuffix = note ? ` ${note}` : "";

  const seenStarts = new Map<string, string>();
  for (const kind of ["code", "value", "comment"] as const) {
    for (const [i, def] of tagDef[kind].entries()) {
      const location = `${prefix}.${kind}[${i}].start${locationSuffix}`;
      const firstLocation = seenStarts.get(def.start);
      if (firstLocation !== undefined) {
        throw new KatazomeError(
          `Setting file "${filePath}": duplicate start string "${def.start}" at ${location} (already defined at ${firstLocation}).`
        );
      }
      seenStarts.set(def.start, location);
    }
  }
}

function warnUnknownKeys(
  obj: Record<string, unknown>,
  knownKeys: string[],
  filePath: string,
  location: string
): void {
  const loc = location || "(root)";
  for (const key of Object.keys(obj)) {
    if (!knownKeys.includes(key)) {
      console.warn(
        `Setting file "${filePath}": unknown key "${key}" in ${loc} (ignored).`
      );
    }
  }
}

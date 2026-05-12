import { readAndParse } from "../utils/file-parser.ts";
import type {
  ExistingFileBehavior,
  FilePatternConfig,
  FilePatternImportsConfig,
  FilePatternTagDefinitionConfig,
  ImportEntry,
  QuestionDefinition,
  QuestionOptionDefinition,
  QuestionSelectDefinition,
  QuestionTextDefinition,
  RootImportsConfig,
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

  warnUnknownKeys(obj, ["tagDefinition", "existingFile", "exclude", "imports", "files", "questions"], filePath, "");

  const tagDefinition = validateCommonTagDefinition(obj["tagDefinition"], filePath);
  const existingFile = validateExistingFileBehavior(obj["existingFile"], filePath, `existingFile`);
  const exclude = validateExcludeArray(obj["exclude"], filePath);
  const imports = validateRootImportsConfig(obj["imports"], filePath);
  const files = validateFilesArray(obj["files"], filePath);
  const questions = validateQuestionsArray(obj["questions"], filePath);

  // Duplicate start string check for each file pattern's resolved definition.
  for (const [i, fileConfig] of files.entries()) {
    const fileTagDef = fileConfig.tagDefinition;
    checkDuplicateStarts(fileTagDef, i, fileConfig.pattern, filePath);

    if (fileTagDef.inherit) {
      // Also check the combined (common + file pattern) definition.
      const combined: TagDefinition = {
        code: [...tagDefinition.code, ...fileTagDef.code],
        value: [...tagDefinition.value, ...fileTagDef.value],
        comment: [...tagDefinition.comment, ...fileTagDef.comment],
      };
      checkDuplicateStarts(combined, i, fileConfig.pattern, filePath, "(combined with common tagDefinition)");
    }
  }

  return {
    tagDefinition,
    ...(existingFile !== undefined ? { existingFile } : {}),
    exclude,
    ...(imports !== undefined ? { imports } : {}),
    files,
    ...(questions !== undefined ? { questions } : {}),
  };
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

  checkDuplicateStarts(result, undefined, undefined, filePath);

  return result;
}

function validateExistingFileBehavior(
  value: unknown,
  filePath: string,
  location: string
): ExistingFileBehavior | undefined {
  if (value === undefined) return undefined;

  if (value !== "error" && value !== "overwrite" && value !== "skip" && value !== "prompt") {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location} must be "error", "overwrite", "skip", or "prompt".`
    );
  }
  return value;
}

function validateExcludeArray(value: unknown, filePath: string): string[] {
  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": "exclude" must be an array.`
    );
  }

  return value.map((item, i) => {
    if (typeof item !== "string" || item.length === 0) {
      throw new KatazomeError(
        `Setting file "${filePath}": exclude[${i}] must be a non-empty string.`
      );
    }
    return item;
  });
}

function validateRootImportsConfig(
  value: unknown,
  filePath: string
): RootImportsConfig | undefined {
  if (value === undefined) return undefined;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": "imports" must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;
  warnUnknownKeys(obj, ["paths"], filePath, "imports");

  return { paths: validateImportPaths(obj["paths"], filePath, "imports.paths") };
}

function validateFilePatternImportsConfig(
  value: unknown,
  index: number,
  filePath: string
): FilePatternImportsConfig | undefined {
  if (value === undefined) return undefined;

  const location = `files[${index}].imports`;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": "${location}" must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;
  warnUnknownKeys(obj, ["inherit", "paths"], filePath, location);

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
    paths: validateImportPaths(obj["paths"], filePath, `${location}.paths`),
  };
}

function validateImportPaths(
  value: unknown,
  filePath: string,
  location: string
): ImportEntry[] {
  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": "${location}" must be an array.`
    );
  }

  return value.map((item, i) => validateImportEntry(item, filePath, `${location}[${i}]`));
}

function validateImportEntry(
  value: unknown,
  filePath: string,
  location: string
): ImportEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location} must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;
  warnUnknownKeys(obj, ["path", "as"], filePath, location);

  if (typeof obj["path"] !== "string" || obj["path"].length === 0) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location}.path must be a non-empty string.`
    );
  }

  if (typeof obj["as"] !== "string" || obj["as"].length === 0) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location}.as must be a non-empty string.`
    );
  }

  if (obj["as"] === "ktzm") {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location}.as must not be "ktzm" (reserved by the runtime).`
    );
  }

  return { path: obj["path"], as: obj["as"] };
}

function validateFilesArray(
  value: unknown,
  filePath: string
): FilePatternConfig[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": "files" must be an array.`
    );
  }

  return value.map((item, i) => validateFilePatternConfig(item, i, filePath));
}

function validateFilePatternConfig(
  value: unknown,
  index: number,
  filePath: string
): FilePatternConfig {
  const location = `files[${index}]`;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location} must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;
  warnUnknownKeys(obj, ["pattern", "tagDefinition", "existingFile", "imports"], filePath, location);

  if (typeof obj["pattern"] !== "string" || obj["pattern"].length === 0) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location}.pattern must be a non-empty string.`
    );
  }
  const pattern = obj["pattern"];

  const existingFile = validateExistingFileBehavior(obj["existingFile"], filePath, `${location}.existingFile`);
  const imports = validateFilePatternImportsConfig(obj["imports"], index, filePath);
  return {
    pattern,
    tagDefinition: validateFilePatternTagDefinitionConfig(
      obj["tagDefinition"],
      index,
      pattern,
      filePath
    ),
    ...(existingFile !== undefined ? { existingFile } : {}),
    ...(imports !== undefined ? { imports } : {}),
  };
}

function validateFilePatternTagDefinitionConfig(
  value: unknown,
  index: number,
  _pattern: string,
  filePath: string
): FilePatternTagDefinitionConfig {
  const location = `files[${index}].tagDefinition`;

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
 * @param index    Index into the files array, or undefined for the common definition.
 * @param pattern  Pattern string for error messages, or undefined for the common definition.
 * @param filePath Setting file path for error messages.
 * @param note     Optional suffix appended to the error message location.
 */
function checkDuplicateStarts(
  tagDef: TagDefinition,
  index: number | undefined,
  _pattern: string | undefined,
  filePath: string,
  note = ""
): void {
  const prefix = index !== undefined
    ? `files[${index}].tagDefinition`
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

function validateQuestionsArray(
  value: unknown,
  filePath: string
): QuestionDefinition[] | undefined {
  if (value === undefined) return undefined;

  if (!Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": "questions" must be an array.`
    );
  }

  const questions = value.map((item, i) =>
    validateQuestionDefinition(item, filePath, `questions[${i}]`)
  );

  const seenNames = new Set<string>();
  for (const q of questions) {
    if (seenNames.has(q.name)) {
      throw new KatazomeError(
        `Setting file "${filePath}": duplicate question name "${q.name}" in questions.`
      );
    }
    seenNames.add(q.name);
  }

  return questions;
}

function validateQuestionDefinition(
  value: unknown,
  filePath: string,
  location: string
): QuestionDefinition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location} must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj["name"] !== "string" || obj["name"].length === 0) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location}.name must be a non-empty string.`
    );
  }
  const name = obj["name"];

  const kind = obj["kind"];
  if (kind !== "text" && kind !== "select") {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location}.kind must be "text" or "select".`
    );
  }

  if (typeof obj["message"] !== "string" || obj["message"].length === 0) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location}.message must be a non-empty string.`
    );
  }
  const message = obj["message"];

  if (kind === "text") {
    return validateQuestionTextDefinition(obj, name, message, filePath, location);
  } else {
    return validateQuestionSelectDefinition(obj, name, message, filePath, location);
  }
}

function validateQuestionTextDefinition(
  obj: Record<string, unknown>,
  name: string,
  message: string,
  filePath: string,
  location: string
): QuestionTextDefinition {
  warnUnknownKeys(obj, ["name", "kind", "message", "type", "default"], filePath, location);

  if ("options" in obj) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location} with kind "text" must not have "options".`
    );
  }

  const type = obj["type"];
  if (type !== "string" && type !== "number") {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location}.type must be "string" or "number".`
    );
  }

  const result: QuestionTextDefinition = { name, kind: "text", type, message };

  if ("default" in obj) {
    const def = obj["default"];
    if (typeof def !== "string" && typeof def !== "number") {
      throw new KatazomeError(
        `Setting file "${filePath}": ${location}.default must be a string or number.`
      );
    }
    result.default = def;
  }

  return result;
}

function validateQuestionSelectDefinition(
  obj: Record<string, unknown>,
  name: string,
  message: string,
  filePath: string,
  location: string
): QuestionSelectDefinition {
  warnUnknownKeys(obj, ["name", "kind", "message", "options", "default"], filePath, location);

  if ("type" in obj) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location} with kind "select" must not have "type".`
    );
  }

  const result: QuestionSelectDefinition = {
    name,
    kind: "select",
    message,
    options: validateQuestionOptions(obj["options"], filePath, `${location}.options`),
  };

  if ("default" in obj) {
    result.default = obj["default"];
  }

  return result;
}

function validateQuestionOptions(
  value: unknown,
  filePath: string,
  location: string
): QuestionOptionDefinition[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new KatazomeError(
      `Setting file "${filePath}": "${location}" must be a non-empty array.`
    );
  }

  return value.map((item, i) =>
    validateQuestionOption(item, filePath, `${location}[${i}]`)
  );
}

function validateQuestionOption(
  value: unknown,
  filePath: string,
  location: string
): QuestionOptionDefinition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location} must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;
  warnUnknownKeys(obj, ["label", "value"], filePath, location);

  if (typeof obj["label"] !== "string" || obj["label"].length === 0) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location}.label must be a non-empty string.`
    );
  }

  if (!("value" in obj)) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location}.value is required.`
    );
  }

  return { label: obj["label"], value: obj["value"] };
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

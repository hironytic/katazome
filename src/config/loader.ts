import JSON5 from "json5";
import type { ExtensionTagDefinition, Setting, TagTypeDefinition } from "../types.ts";
import { KatazomeError } from "../errors.ts";

/**
 * Loads and validates a setting file.
 * Supported formats: .json, .json5
 */
export async function loadSetting(filePath: string): Promise<Setting> {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext !== "json" && ext !== "json5") {
    throw new KatazomeError(
      `Unsupported setting file format: "${filePath}". Use .json or .json5.`
    );
  }

  let raw: string;
  try {
    raw = await Bun.file(filePath).text();
  } catch {
    throw new KatazomeError(`Cannot read setting file: "${filePath}"`);
  }

  let parsed: unknown;
  try {
    parsed = ext === "json5" ? JSON5.parse(raw) : JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new KatazomeError(`Failed to parse setting file "${filePath}": ${msg}`);
  }

  return validateSetting(parsed, filePath);
}

function validateSetting(value: unknown, filePath: string): Setting {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(`Setting file "${filePath}" must be a JSON object.`);
  }

  const obj = value as Record<string, unknown>;

  if (!("tagDefinition" in obj) || typeof obj["tagDefinition"] !== "object" || obj["tagDefinition"] === null) {
    throw new KatazomeError(`Setting file "${filePath}" must have a "tagDefinition" object.`);
  }

  const tagDefinition: Record<string, ExtensionTagDefinition> = {};
  const tagDefObj = obj["tagDefinition"] as Record<string, unknown>;

  for (const [ext, extDef] of Object.entries(tagDefObj)) {
    tagDefinition[ext] = validateExtensionTagDefinition(extDef, ext, filePath);
  }

  return { tagDefinition };
}

function validateExtensionTagDefinition(
  value: unknown,
  ext: string,
  filePath: string
): ExtensionTagDefinition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": tagDefinition["${ext}"] must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;

  const result: ExtensionTagDefinition = {
    code: validateTagTypeDefinitions(obj["code"], ext, "code", filePath),
    value: validateTagTypeDefinitions(obj["value"], ext, "value", filePath),
    comment: validateTagTypeDefinitions(obj["comment"], ext, "comment", filePath),
  };

  // Detect duplicate start strings within the same extension (across all tag kinds).
  const seenStarts = new Map<string, string>();
  for (const kind of ["code", "value", "comment"] as const) {
    for (const [i, def] of result[kind].entries()) {
      const location = `tagDefinition["${ext}"].${kind}[${i}].start`;
      const firstLocation = seenStarts.get(def.start);
      if (firstLocation !== undefined) {
        throw new KatazomeError(
          `Setting file "${filePath}": duplicate start string "${def.start}" at ${location} (already defined at ${firstLocation}).`
        );
      }
      seenStarts.set(def.start, location);
    }
  }

  return result;
}

function validateTagTypeDefinitions(
  value: unknown,
  ext: string,
  kind: string,
  filePath: string
): TagTypeDefinition[] {
  if (!Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": tagDefinition["${ext}"].${kind} must be an array.`
    );
  }

  return value.map((item, i) => validateTagTypeDefinition(item, ext, kind, i, filePath));
}

function validateTagTypeDefinition(
  value: unknown,
  ext: string,
  kind: string,
  index: number,
  filePath: string
): TagTypeDefinition {
  const location = `tagDefinition["${ext}"].${kind}[${index}]`;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KatazomeError(
      `Setting file "${filePath}": ${location} must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;

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

import JSON5 from "json5";
import { parse as parseYaml } from "yaml";
import { KatazomeError } from "../errors.ts";

/**
 * Reads a file and parses it according to its extension.
 * - .yaml / .yml → YAML
 * - .toml        → TOML
 * - anything else (.json, .json5, unknown, no extension) → JSON5
 */
export async function readAndParse(
  filePath: string,
  fileLabel: string
): Promise<unknown> {
  let raw: string;
  try {
    raw = await Bun.file(filePath).text();
  } catch {
    throw new KatazomeError(`Cannot read ${fileLabel}: "${filePath}"`);
  }

  const ext = filePath.split(".").pop()?.toLowerCase();

  try {
    if (ext === "toml") {
      return Bun.TOML.parse(raw);
    }
    if (ext === "yaml" || ext === "yml") {
      return parseYaml(raw) as unknown;
    }
    return JSON5.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new KatazomeError(`Failed to parse ${fileLabel} "${filePath}": ${msg}`);
  }
}

import JSON5 from "json5";
import { KatazomeError } from "../errors.ts";

/**
 * Loads input data from a JSON or JSON5 file.
 * The loaded data is returned as-is (typed as unknown; callers treat it as any).
 */
export async function loadInput(filePath: string): Promise<unknown> {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext !== "json" && ext !== "json5") {
    throw new KatazomeError(
      `Unsupported input file format: "${filePath}". Use .json or .json5.`
    );
  }

  let raw: string;
  try {
    raw = await Bun.file(filePath).text();
  } catch {
    throw new KatazomeError(`Cannot read input file: "${filePath}"`);
  }

  try {
    return ext === "json5" ? JSON5.parse(raw) : JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new KatazomeError(`Failed to parse input file "${filePath}": ${msg}`);
  }
}

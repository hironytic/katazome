import { readAndParse } from "../utils/file-parser.ts";

/**
 * Loads input data from a file.
 * Supported formats: .json, .json5, .yaml, .yml, .toml
 * Files with unknown or no extension are parsed as JSON5.
 * The loaded data is returned as-is (typed as unknown; callers treat it as any).
 */
export async function loadInput(filePath: string): Promise<unknown> {
  return readAndParse(filePath, "input file");
}

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { generateRuntimeContent } from "../runtime/content.ts";
import { KatazomeError } from "../errors.ts";

/**
 * Describes how the output is directed when rendering a template.
 *
 * - "file": output goes to a fixed file path. ktzm.outputFilePath is readable/writable
 *   but does not affect the actual output path.
 * - "directory": output goes to outputDir/ktzm.outputFilePath. The template can change
 *   the output filename by assigning to ktzm.outputFilePath.
 */
export type RenderOutput =
  | { kind: "file"; outputFilePath: string; initialRelativePath: string }
  | { kind: "directory"; outputDir: string; initialRelativePath: string };

/**
 * Renders a transpilate by running it in a Worker thread.
 *
 * @param transpilateContent  The TypeScript transpilate source code.
 * @param inputData           Parsed input data (embedded into the runtime).
 * @param answerData          Resolved question answers (embedded into the runtime).
 * @param output              Describes where the rendered output should be written.
 */
export async function render(
  transpilateContent: string,
  inputData: unknown,
  answerData: unknown,
  output: RenderOutput
): Promise<void> {
  const tmpDir = join(tmpdir(), `ktzm-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });

  try {
    const runtimePath = join(tmpDir, "ktzm-runtime.ts");
    const transpilatePath = join(tmpDir, "transpilate.ts");

    const outputEmbed = output.kind === "file"
      ? { kind: "file" as const, filePath: output.outputFilePath, initialRelativePath: output.initialRelativePath }
      : { kind: "directory" as const, outputDir: output.outputDir, initialRelativePath: output.initialRelativePath };

    writeFileSync(runtimePath, generateRuntimeContent(inputData, answerData, outputEmbed), "utf-8");
    writeFileSync(transpilatePath, transpilateContent, "utf-8");

    const worker = new Worker(transpilatePath);
    let settled = false;
    await new Promise<void>((resolve, reject) => {
      const fail = (msg: string) => {
        if (!settled) {
          settled = true;
          reject(new KatazomeError(msg));
        }
      };
      worker.addEventListener("close", (event) => {
        if (!settled) {
          settled = true;
          if (event.code === 0) {
            resolve();
          } else {
            fail(`Template execution failed with exit code ${event.code}.`);
          }
        }
      });
      worker.addEventListener("error", (event) => {
        fail(`Template execution failed:\n${event.message}`);
      });
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

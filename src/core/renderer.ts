import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
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
 *   the output filename by assigning to ktzm.outputFilePath. The renderer validates
 *   the final path and places the file after Worker exit.
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

    let outputEmbed;
    if (output.kind === "file") {
      outputEmbed = { kind: "file" as const, filePath: output.outputFilePath, initialRelativePath: output.initialRelativePath };
    } else {
      outputEmbed = {
        kind: "directory" as const,
        contentTmpPath: join(tmpDir, "output_content"),
        pathTmpPath: join(tmpDir, "output_filepath"),
        initialRelativePath: output.initialRelativePath,
      };
    }

    writeFileSync(runtimePath, generateRuntimeContent(inputData, answerData, outputEmbed), "utf-8");
    writeFileSync(transpilatePath, transpilateContent, "utf-8");

    if (output.kind === "file") {
      // Pre-create the output file so it always exists after render, even if
      // the template produces no output (the runtime will overwrite it).
      writeFileSync(output.outputFilePath, "", "utf-8");
    }

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

    // For directory mode: validate ktzm.outputFilePath and place the output file.
    if (output.kind === "directory") {
      const relativePath = readFileSync(join(tmpDir, "output_filepath"), "utf-8");
      const resolvedPath = resolve(output.outputDir, relativePath);
      if (!resolvedPath.startsWith(output.outputDir + sep) && resolvedPath !== output.outputDir) {
        throw new KatazomeError(
          `ktzm.outputFilePath resolves outside the output directory: "${relativePath}"`
        );
      }
      mkdirSync(dirname(resolvedPath), { recursive: true });
      copyFileSync(join(tmpDir, "output_content"), resolvedPath);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

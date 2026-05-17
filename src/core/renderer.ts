import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { generateRuntimeContent } from "../runtime/content.ts";
import { KatazomeError } from "../errors.ts";
import { askExistingFileAction } from "../commands/utils.ts";
import type { ExistingFileBehavior } from "../types.ts";

/**
 * Describes how the output is directed when rendering a template.
 *
 * existingFileBehavior controls what happens when the output file already exists:
 * - "file": output goes to a fixed file path. ktzm.outputFilePath is readable/writable
 *   but does not affect the actual output path. existingFileBehavior is checked by
 *   the renderer before running the Worker.
 * - "directory": output goes to outputDir/ktzm.outputFilePath. The template can change
 *   the output filename by assigning to ktzm.outputFilePath.
 *   "overwrite"/"skip"/"error" are handled inside the runtime after the path is
 *   determined; "prompt" is handled by the renderer after Worker exit.
 */
export type RenderOutput =
  | { kind: "file"; outputFilePath: string; initialRelativePath: string; existingFileBehavior: ExistingFileBehavior; displayName: string }
  | { kind: "directory"; outputDir: string; initialRelativePath: string; existingFileBehavior: ExistingFileBehavior; displayName: string };

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
  // For file mode: check existingFile before running the Worker (output path is fixed).
  if (output.kind === "file") {
    const behavior = output.existingFileBehavior;
    if (behavior !== "overwrite" && existsSync(output.outputFilePath)) {
      if (behavior === "error") {
        throw new KatazomeError(
          `Output file already exists: "${output.outputFilePath}". Use a different existingFile setting to allow overwriting or skipping.`
        );
      }
      if (behavior === "skip") return;
      if (behavior === "prompt") {
        const action = await askExistingFileAction(output.displayName);
        if (action === "skip") return;
        if (action === "error") {
          throw new KatazomeError(`Output file already exists: "${output.outputFilePath}".`);
        }
      }
    }
  }

  const tmpDir = join(tmpdir(), `ktzm-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });

  try {
    const runtimePath = join(tmpDir, "ktzm-runtime.mts");
    const transpilatePath = join(tmpDir, "transpilate.mts");

    const isPrompt = output.kind === "directory" && output.existingFileBehavior === "prompt";

    let outputEmbed;
    if (output.kind === "file") {
      outputEmbed = { kind: "file" as const, filePath: output.outputFilePath, initialRelativePath: output.initialRelativePath };
    } else if (isPrompt) {
      outputEmbed = {
        kind: "directory-prompt" as const,
        outputDir: output.outputDir,
        contentTmpPath: join(tmpDir, "output_content"),
        pathTmpPath: join(tmpDir, "output_filepath"),
        initialRelativePath: output.initialRelativePath,
      };
    } else {
      outputEmbed = {
        kind: "directory" as const,
        outputDir: output.outputDir,
        initialRelativePath: output.initialRelativePath,
        existingFileBehavior: output.existingFileBehavior as "overwrite" | "skip" | "error",
      };
    }

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
      worker.on("exit", (code) => {
        if (!settled) {
          settled = true;
          if (code === 0) {
            resolve();
          } else {
            fail(`Template execution failed with exit code ${code}.`);
          }
        }
      });
      worker.on("error", (err: Error) => {
        fail(`Template execution failed:\n${err.message}`);
      });
    });

    // For directory "prompt" mode: read the final path, ask the user, then copy.
    if (isPrompt && output.kind === "directory") {
      const relativePath = readFileSync(join(tmpDir, "output_filepath"), "utf-8");
      const resolvedPath = resolve(output.outputDir, relativePath);
      if (!resolvedPath.startsWith(output.outputDir + sep) && resolvedPath !== output.outputDir) {
        throw new KatazomeError(
          `ktzm.outputFilePath resolves outside the output directory: "${relativePath}"`
        );
      }

      const contentTmpPath = join(tmpDir, "output_content");
      let shouldWrite = true;
      if (existsSync(resolvedPath)) {
        const action = await askExistingFileAction(output.displayName);
        if (action === "skip") {
          shouldWrite = false;
        } else if (action === "error") {
          throw new KatazomeError(`Output file already exists: "${resolvedPath}".`);
        }
      }

      if (shouldWrite) {
        mkdirSync(dirname(resolvedPath), { recursive: true });
        copyFileSync(contentTmpPath, resolvedPath);
      }
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

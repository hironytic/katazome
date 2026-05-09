import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { generateRuntimeContent } from "../runtime/content.ts";
import { KatazomeError } from "../errors.ts";

/**
 * Renders a transpilate by running it in a Worker thread.
 *
 * Input data and the output file path are embedded directly into the runtime
 * file as JSON/string literals. The runtime writes its output to that path on
 * process exit, which fires reliably within the Worker's own event loop.
 *
 * @param transpilateContent  The TypeScript transpilate source code.
 * @param inputData           Parsed input data (embedded into the runtime).
 * @param outputFilePath      Absolute path where the rendered output should be written.
 */
export async function render(
  transpilateContent: string,
  inputData: unknown,
  outputFilePath: string
): Promise<void> {
  const tmpDir = join(tmpdir(), `ktzm-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });

  try {
    const runtimePath = join(tmpDir, "ktzm-runtime.ts");
    const transpilatePath = join(tmpDir, "transpilate.ts");

    writeFileSync(runtimePath, generateRuntimeContent(inputData, outputFilePath), "utf-8");
    writeFileSync(transpilatePath, transpilateContent, "utf-8");
    // Pre-create the output file so it always exists after render, even if
    // the template produces no output (the runtime will overwrite it).
    writeFileSync(outputFilePath, "", "utf-8");

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

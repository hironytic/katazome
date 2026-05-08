import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { generateRuntimeContent } from "../runtime/content.ts";
import { KatazomeError } from "../errors.ts";

/**
 * Renders a transpilate by running it with Bun as a subprocess.
 *
 * Input data is embedded directly into the runtime file as a JSON literal.
 * The runtime writes its output to KTZM_OUTPUT_FILE (passed as an env var).
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

    writeFileSync(runtimePath, generateRuntimeContent(inputData), "utf-8");
    writeFileSync(transpilatePath, transpilateContent, "utf-8");
    // Pre-create the output file so it always exists after render, even if
    // the template produces no output (the runtime will overwrite it).
    writeFileSync(outputFilePath, "", "utf-8");

    const proc = Bun.spawn(["bun", "run", transpilatePath], {
      env: {
        ...process.env,
        KTZM_OUTPUT_FILE: outputFilePath,
      },
      stdout: "inherit",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderrText = await new Response(proc.stderr).text();
      process.stderr.write(stderrText);
      throw new KatazomeError(`Template execution failed with exit code ${exitCode}.`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

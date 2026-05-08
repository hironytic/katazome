import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { runtimeContent } from "../runtime/content.ts";
import { KatazomeError } from "../errors.ts";

/**
 * Renders a transpilate by running it with Bun as a subprocess.
 *
 * The transpilate imports the runtime file. The runtime reads input from
 * KTZM_INPUT_FILE and writes output to KTZM_OUTPUT_FILE, both passed as
 * environment variables.
 *
 * @param transpilateContent  The TypeScript transpilate source code.
 * @param inputData           Parsed input data (will be serialized to JSON).
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
    const inputPath = join(tmpDir, "input.json");

    writeFileSync(runtimePath, runtimeContent, "utf-8");
    writeFileSync(transpilatePath, transpilateContent, "utf-8");
    writeFileSync(inputPath, JSON.stringify(inputData), "utf-8");
    // Pre-create the output file so it always exists after render, even if
    // the template produces no output (the runtime will overwrite it).
    writeFileSync(outputFilePath, "", "utf-8");

    const proc = Bun.spawn(["bun", "run", transpilatePath], {
      env: {
        ...process.env,
        KTZM_INPUT_FILE: inputPath,
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

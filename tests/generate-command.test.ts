import { describe, expect, test } from "bun:test";
import { runGenerate } from "../src/commands/generate.ts";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const settingJson = JSON.stringify({
  extensions: {
    txt: {
      tagDefinition: {
        code: [{ start: "/*{%", end: "%}*/" }],
        value: [{ start: "_V_", end: "_" }],
      },
    },
  },
});

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = join(tmpdir(), `ktzm-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return fn(dir).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe("runGenerate without --input", () => {
  test("generates output from plain template with no input", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "setting.json");
      const templatePath = join(dir, "template.txt");
      const outputPath = join(dir, "output.txt");

      writeFileSync(settingPath, settingJson, "utf-8");
      writeFileSync(templatePath, "hello world\n", "utf-8");

      await runGenerate({ setting: settingPath, templatePath, outputPath });

      expect(await Bun.file(outputPath).text()).toBe("hello world\n");
    });
  });

  test("ktzm.input is empty object when --input is omitted", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "setting.json");
      const templatePath = join(dir, "template.txt");
      const outputPath = join(dir, "output.txt");

      writeFileSync(settingPath, settingJson, "utf-8");
      writeFileSync(
        templatePath,
        "/*{% const val = ktzm.input.missing ?? 'default'; %}*/_V_val_",
        "utf-8"
      );

      await runGenerate({ setting: settingPath, templatePath, outputPath });

      expect(await Bun.file(outputPath).text()).toBe("default");
    });
  });
});

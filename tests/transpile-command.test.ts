import { describe, expect, test } from "bun:test";
import { runTranspile } from "../src/commands/transpile.ts";
import { KatazomeError } from "../src/errors.ts";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

describe("runTranspile without --setting", () => {
  test("auto-detects ktzm-setting.json next to template when --setting is omitted", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "template.txt");

      writeFileSync(join(dir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(templatePath, "hello world\n", "utf-8");

      await runTranspile({ templatePath });

      expect(existsSync(join(dir, "template.txt.ts"))).toBe(true);
    });
  });

  test("throws KatazomeError when no setting file is found", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "template.txt");
      writeFileSync(templatePath, "hello\n", "utf-8");

      await expect(runTranspile({ templatePath })).rejects.toThrow(KatazomeError);
    });
  });
});

describe("runTranspile setting file handling", () => {
  test("skips setting file when input is a directory", async () => {
    await withTempDir(async (dir) => {
      const inputDir = join(dir, "src");
      const outputDir = join(dir, "out");
      mkdirSync(inputDir, { recursive: true });

      writeFileSync(join(inputDir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(join(inputDir, "hello.txt"), "hello\n", "utf-8");

      await runTranspile({ templatePath: inputDir, outputPath: outputDir });

      // Setting file is not copied to the output directory
      expect(existsSync(join(outputDir, "ktzm-setting.json"))).toBe(false);
      // Template is transpiled with .ts extension
      expect(existsSync(join(outputDir, "hello.txt.ts"))).toBe(true);
    });
  });

  test("throws when single template file is the setting file", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "ktzm-setting.json");
      writeFileSync(settingPath, settingJson, "utf-8");

      await expect(
        runTranspile({ setting: settingPath, templatePath: settingPath })
      ).rejects.toThrow(KatazomeError);
    });
  });

  test("throws when output path is the setting file", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "ktzm-setting.json");
      const templatePath = join(dir, "template.txt");

      writeFileSync(settingPath, settingJson, "utf-8");
      writeFileSync(templatePath, "hello\n", "utf-8");

      await expect(
        runTranspile({ setting: settingPath, templatePath, outputPath: settingPath })
      ).rejects.toThrow(KatazomeError);
    });
  });
});

describe("runTranspile without --input", () => {
  test("generates transpilate and runtime files with no input", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "setting.json");
      const templatePath = join(dir, "template.txt");

      writeFileSync(settingPath, settingJson, "utf-8");
      writeFileSync(templatePath, "hello world\n", "utf-8");

      await runTranspile({ setting: settingPath, templatePath });

      expect(existsSync(join(dir, "template.txt.ts"))).toBe(true);
      expect(existsSync(join(dir, "ktzm-runtime.ts"))).toBe(true);
    });
  });

  test("embeds {} as input data in runtime when --input is omitted", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "setting.json");
      const templatePath = join(dir, "template.txt");

      writeFileSync(settingPath, settingJson, "utf-8");
      writeFileSync(templatePath, "hello\n", "utf-8");

      await runTranspile({ setting: settingPath, templatePath });

      const runtimeContent = await Bun.file(join(dir, "ktzm-runtime.ts")).text();
      expect(runtimeContent).toContain("const inputData: unknown = {}");
    });
  });
});

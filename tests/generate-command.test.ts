import { describe, expect, test } from "bun:test";
import { runGenerate } from "../src/commands/generate.ts";
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

describe("runGenerate without --setting", () => {
  test("auto-detects ktzm-setting.json next to template when --setting is omitted", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "template.txt");
      const outputPath = join(dir, "output.txt");

      writeFileSync(join(dir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(templatePath, "hello world\n", "utf-8");

      await runGenerate({ templatePath, outputPath });

      expect(await Bun.file(outputPath).text()).toBe("hello world\n");
    });
  });

  test("prefers json over json5/yaml/toml when multiple candidates exist", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "template.txt");
      const outputPath = join(dir, "output.txt");

      writeFileSync(join(dir, "ktzm-setting.json"), settingJson, "utf-8");
      // Also place a yaml file; json should win
      writeFileSync(join(dir, "ktzm-setting.yaml"), "invalid yaml that would fail", "utf-8");
      writeFileSync(templatePath, "hello\n", "utf-8");

      await runGenerate({ templatePath, outputPath });

      expect(await Bun.file(outputPath).text()).toBe("hello\n");
    });
  });

  test("throws KatazomeError when no setting file is found", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "template.txt");
      const outputPath = join(dir, "output.txt");

      writeFileSync(templatePath, "hello\n", "utf-8");

      await expect(runGenerate({ templatePath, outputPath })).rejects.toThrow(KatazomeError);
    });
  });
});

describe("runGenerate setting file handling", () => {
  test("skips setting file when input is a directory", async () => {
    await withTempDir(async (dir) => {
      const inputDir = join(dir, "src");
      const outputDir = join(dir, "out");
      mkdirSync(inputDir, { recursive: true });

      writeFileSync(join(inputDir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(join(inputDir, "hello.txt"), "hello\n", "utf-8");

      await runGenerate({ templatePath: inputDir, outputPath: outputDir });

      expect(existsSync(join(outputDir, "hello.txt"))).toBe(true);
      expect(existsSync(join(outputDir, "ktzm-setting.json"))).toBe(false);
    });
  });

  test("throws when single template file is the setting file", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "ktzm-setting.json");
      const outputPath = join(dir, "output.txt");

      writeFileSync(settingPath, settingJson, "utf-8");

      await expect(
        runGenerate({ setting: settingPath, templatePath: settingPath, outputPath })
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
        runGenerate({ setting: settingPath, templatePath, outputPath: settingPath })
      ).rejects.toThrow(KatazomeError);
    });
  });
});

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

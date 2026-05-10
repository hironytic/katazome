import { describe, expect, test } from "bun:test";
import { runTranspile } from "../src/commands/transpile.ts";
import { KatazomeError } from "../src/errors.ts";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const settingJson = JSON.stringify({
  files: [
    {
      pattern: "*.txt",
      tagDefinition: {
        code: [{ start: "/*{%", end: "%}*/" }],
        value: [{ start: "_V_", end: "_" }],
      },
    },
  ],
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

      await runTranspile({ templatePath, force: true });

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

      await runTranspile({ templatePath: inputDir, outputPath: outputDir, force: true });

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

      await runTranspile({ setting: settingPath, templatePath, force: true });

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

      await runTranspile({ setting: settingPath, templatePath, force: true });

      const runtimeContent = await Bun.file(join(dir, "ktzm-runtime.ts")).text();
      expect(runtimeContent).toContain("const inputData: unknown = {}");
    });
  });
});

describe("runTranspile existing output handling", () => {
  test("overwrites existing single output file when --force is given", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "setting.json");
      const templatePath = join(dir, "template.txt");
      const outputPath = join(dir, "template.txt.ts");

      writeFileSync(settingPath, settingJson, "utf-8");
      writeFileSync(templatePath, "hello\n", "utf-8");
      writeFileSync(outputPath, "old transpilate\n", "utf-8");

      await runTranspile({ setting: settingPath, templatePath, force: true });

      const content = await Bun.file(outputPath).text();
      expect(content).not.toBe("old transpilate\n");
    });
  });

  test("replaces existing output directory when --force is given", async () => {
    await withTempDir(async (dir) => {
      const inputDir = join(dir, "src");
      const outputDir = join(dir, "out");
      mkdirSync(inputDir, { recursive: true });
      mkdirSync(outputDir, { recursive: true });

      writeFileSync(join(inputDir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(join(inputDir, "hello.txt"), "hello\n", "utf-8");
      // Put a stale file in the output directory that should be removed
      writeFileSync(join(outputDir, "stale.txt.ts"), "stale\n", "utf-8");

      await runTranspile({ templatePath: inputDir, outputPath: outputDir, force: true });

      expect(existsSync(join(outputDir, "hello.txt.ts"))).toBe(true);
      expect(existsSync(join(outputDir, "stale.txt.ts"))).toBe(false);
    });
  });
});

describe("runTranspile imports", () => {
  test("user import appears as absolute path in transpilate appended block", async () => {
    await withTempDir(async (dir) => {
      const helperContent = `export function greet(name: string) { return "Hello, " + name; }`;
      writeFileSync(join(dir, "helpers.ts"), helperContent, "utf-8");

      const setting = {
        imports: { paths: [{ path: "./helpers.ts", as: "helpers" }] },
        files: [
          {
            pattern: "*.txt",
            tagDefinition: {
              value: [{ start: "_V_", end: "_" }],
            },
          },
        ],
      };
      writeFileSync(join(dir, "ktzm-setting.json"), JSON.stringify(setting), "utf-8");
      writeFileSync(join(dir, "template.txt"), "_V_helpers.greet('world')_\n", "utf-8");

      await runTranspile({ templatePath: join(dir, "template.txt"), force: true });

      const transpilate = await Bun.file(join(dir, "template.txt.ts")).text();
      expect(transpilate).toContain(`import * as helpers from "${join(dir, "helpers.ts")}"`);
    });
  });
});

describe("runTranspile exclude", () => {
  test("excludes files matching exclude patterns in directory mode", async () => {
    await withTempDir(async (dir) => {
      const inputDir = join(dir, "src");
      const outputDir = join(dir, "out");
      mkdirSync(inputDir, { recursive: true });

      const setting = { exclude: [".DS_Store", "*.local.*"] };
      writeFileSync(join(inputDir, "ktzm-setting.json"), JSON.stringify(setting), "utf-8");
      writeFileSync(join(inputDir, "hello.txt"), "hello\n", "utf-8");
      writeFileSync(join(inputDir, ".DS_Store"), "mac junk\n", "utf-8");
      writeFileSync(join(inputDir, "config.local.txt"), "local config\n", "utf-8");

      await runTranspile({ templatePath: inputDir, outputPath: outputDir, force: true });

      expect(existsSync(join(outputDir, "hello.txt.ts"))).toBe(true);
      expect(existsSync(join(outputDir, ".DS_Store.ts"))).toBe(false);
      expect(existsSync(join(outputDir, "config.local.txt.ts"))).toBe(false);
    });
  });
});

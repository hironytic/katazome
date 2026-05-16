import { describe, expect, test } from "bun:test";
import { runGenerate } from "../src/commands/generate.ts";
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

      await runGenerate({ templatePath: inputDir, outputPath: outputDir + "/" });

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

describe("runGenerate existingFile behavior", () => {
  test("existingFile: overwrite replaces existing file (default)", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "setting.json");
      const templatePath = join(dir, "template.txt");
      const outputPath = join(dir, "output.txt");

      writeFileSync(settingPath, JSON.stringify({ existingFile: "overwrite" }), "utf-8");
      writeFileSync(templatePath, "new content\n", "utf-8");
      writeFileSync(outputPath, "old content\n", "utf-8");

      await runGenerate({ setting: settingPath, templatePath, outputPath });

      expect(await Bun.file(outputPath).text()).toBe("new content\n");
    });
  });

  test("existingFile: skip leaves existing file unchanged", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "setting.json");
      const templatePath = join(dir, "template.txt");
      const outputPath = join(dir, "output.txt");

      writeFileSync(settingPath, JSON.stringify({ existingFile: "skip" }), "utf-8");
      writeFileSync(templatePath, "new content\n", "utf-8");
      writeFileSync(outputPath, "old content\n", "utf-8");

      await runGenerate({ setting: settingPath, templatePath, outputPath });

      expect(await Bun.file(outputPath).text()).toBe("old content\n");
    });
  });

  test("existingFile: skip generates new files that don't exist yet", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "setting.json");
      const templatePath = join(dir, "template.txt");
      const outputPath = join(dir, "output.txt");

      writeFileSync(settingPath, JSON.stringify({ existingFile: "skip" }), "utf-8");
      writeFileSync(templatePath, "new content\n", "utf-8");

      await runGenerate({ setting: settingPath, templatePath, outputPath });

      expect(await Bun.file(outputPath).text()).toBe("new content\n");
    });
  });

  test("existingFile: error throws when output file exists", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "setting.json");
      const templatePath = join(dir, "template.txt");
      const outputPath = join(dir, "output.txt");

      writeFileSync(settingPath, JSON.stringify({ existingFile: "error" }), "utf-8");
      writeFileSync(templatePath, "new content\n", "utf-8");
      writeFileSync(outputPath, "old content\n", "utf-8");

      await expect(
        runGenerate({ setting: settingPath, templatePath, outputPath })
      ).rejects.toThrow(KatazomeError);
    });
  });

  test("existingFile: error does not throw when output file does not exist", async () => {
    await withTempDir(async (dir) => {
      const settingPath = join(dir, "setting.json");
      const templatePath = join(dir, "template.txt");
      const outputPath = join(dir, "output.txt");

      writeFileSync(settingPath, JSON.stringify({ existingFile: "error" }), "utf-8");
      writeFileSync(templatePath, "new content\n", "utf-8");

      await runGenerate({ setting: settingPath, templatePath, outputPath });

      expect(await Bun.file(outputPath).text()).toBe("new content\n");
    });
  });

  test("per-file pattern existingFile overrides root setting", async () => {
    await withTempDir(async (dir) => {
      const inputDir = join(dir, "src");
      const outputDir = join(dir, "out");
      mkdirSync(inputDir, { recursive: true });
      mkdirSync(outputDir, { recursive: true });

      const setting = {
        existingFile: "overwrite",
        files: [{ pattern: "keep.txt", existingFile: "skip" }],
      };
      writeFileSync(join(inputDir, "ktzm-setting.json"), JSON.stringify(setting), "utf-8");
      writeFileSync(join(inputDir, "keep.txt"), "new keep\n", "utf-8");
      writeFileSync(join(inputDir, "replace.txt"), "new replace\n", "utf-8");
      writeFileSync(join(outputDir, "keep.txt"), "old keep\n", "utf-8");
      writeFileSync(join(outputDir, "replace.txt"), "old replace\n", "utf-8");

      await runGenerate({ templatePath: inputDir, outputPath: outputDir });

      // "keep.txt" matches the skip pattern — unchanged
      expect(await Bun.file(join(outputDir, "keep.txt")).text()).toBe("old keep\n");
      // "replace.txt" falls through to root "overwrite"
      expect(await Bun.file(join(outputDir, "replace.txt")).text()).toBe("new replace\n");
    });
  });

  test("existingFile: error stops processing on first conflict in directory mode", async () => {
    await withTempDir(async (dir) => {
      const inputDir = join(dir, "src");
      const outputDir = join(dir, "out");
      mkdirSync(inputDir, { recursive: true });
      mkdirSync(outputDir, { recursive: true });

      writeFileSync(join(inputDir, "ktzm-setting.json"), JSON.stringify({ existingFile: "error" }), "utf-8");
      writeFileSync(join(inputDir, "a.txt"), "a\n", "utf-8");
      writeFileSync(join(outputDir, "a.txt"), "old a\n", "utf-8");

      await expect(
        runGenerate({ templatePath: inputDir, outputPath: outputDir })
      ).rejects.toThrow(KatazomeError);
    });
  });

  test("existingFile: skip in directory mode skips files that already exist at their actual output path", async () => {
    await withTempDir(async (dir) => {
      const outputDir = join(dir, "out");
      mkdirSync(outputDir, { recursive: true });

      // Template renames itself to "renamed.txt" via ktzm.outputFilePath
      const setting = { existingFile: "skip", ...JSON.parse(settingJson) };
      writeFileSync(join(dir, "ktzm-setting.json"), JSON.stringify(setting), "utf-8");
      writeFileSync(join(dir, "hello.txt"), "/*{% ktzm.outputFilePath = 'renamed.txt'; %}*/new content\n", "utf-8");
      writeFileSync(join(outputDir, "renamed.txt"), "old content\n", "utf-8");

      await runGenerate({ templatePath: join(dir, "hello.txt"), outputPath: outputDir + "/" });

      // renamed.txt already exists, so it should be skipped
      expect(await Bun.file(join(outputDir, "renamed.txt")).text()).toBe("old content\n");
    });
  });

  test("existingFile: error in directory mode errors on the actual output path", async () => {
    await withTempDir(async (dir) => {
      const outputDir = join(dir, "out");
      mkdirSync(outputDir, { recursive: true });

      const setting = { existingFile: "error", ...JSON.parse(settingJson) };
      writeFileSync(join(dir, "ktzm-setting.json"), JSON.stringify(setting), "utf-8");
      writeFileSync(join(dir, "hello.txt"), "/*{% ktzm.outputFilePath = 'renamed.txt'; %}*/new content\n", "utf-8");
      writeFileSync(join(outputDir, "renamed.txt"), "old content\n", "utf-8");

      await expect(
        runGenerate({ templatePath: join(dir, "hello.txt"), outputPath: outputDir + "/" })
      ).rejects.toThrow(KatazomeError);
    });
  });

  test("existingFile: overwrite in directory mode overwrites the actual output path", async () => {
    await withTempDir(async (dir) => {
      const outputDir = join(dir, "out");
      mkdirSync(outputDir, { recursive: true });

      const setting = { existingFile: "overwrite", ...JSON.parse(settingJson) };
      writeFileSync(join(dir, "ktzm-setting.json"), JSON.stringify(setting), "utf-8");
      writeFileSync(join(dir, "hello.txt"), "/*{% ktzm.outputFilePath = 'renamed.txt'; %}*/new content\n", "utf-8");
      writeFileSync(join(outputDir, "renamed.txt"), "old content\n", "utf-8");

      await runGenerate({ templatePath: join(dir, "hello.txt"), outputPath: outputDir + "/" });

      expect(await Bun.file(join(outputDir, "renamed.txt")).text()).toBe("new content\n");
    });
  });
});

describe("runGenerate exclude", () => {
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

      await runGenerate({ templatePath: inputDir, outputPath: outputDir + "/" });

      expect(existsSync(join(outputDir, "hello.txt"))).toBe(true);
      expect(existsSync(join(outputDir, ".DS_Store"))).toBe(false);
      expect(existsSync(join(outputDir, "config.local.txt"))).toBe(false);
    });
  });
});

describe("runGenerate error context in directory mode", () => {
  test("includes relative path in error message when a file in a directory fails", async () => {
    await withTempDir(async (dir) => {
      const inputDir = join(dir, "src");
      const outputDir = join(dir, "out");
      mkdirSync(join(inputDir, "sub"), { recursive: true });

      writeFileSync(join(inputDir, "ktzm-setting.json"), settingJson, "utf-8");
      // This file has an unclosed tag and will trigger a KatazomeError
      writeFileSync(join(inputDir, "sub", "broken.txt"), "/*{% unclosed\n", "utf-8");

      await expect(
        runGenerate({ templatePath: inputDir, outputPath: outputDir + "/" })
      ).rejects.toThrow("sub/broken.txt:");
    });
  });
});

describe("runGenerate with questions", () => {
  test("--answers supplies string answer accessible as ktzm.answer", async () => {
    await withTempDir(async (dir) => {
      const setting = {
        questions: [
          { name: "propName", kind: "text", type: "string", message: "Name?" },
        ],
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
      writeFileSync(join(dir, "template.txt"), "_V_ktzm.answer.propName_\n", "utf-8");

      await runGenerate({
        setting: join(dir, "ktzm-setting.json"),
        templatePath: join(dir, "template.txt"),
        outputPath: join(dir, "output.txt"),
        answers: ["propName=hello"],
      });

      expect(await Bun.file(join(dir, "output.txt")).text()).toBe("hello\n");
    });
  });

  test("--answers supplies number answer accessible as ktzm.answer", async () => {
    await withTempDir(async (dir) => {
      const setting = {
        questions: [
          { name: "count", kind: "text", type: "number", message: "Count?" },
        ],
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
      writeFileSync(join(dir, "template.txt"), "_V_ktzm.answer.count * 2_\n", "utf-8");

      await runGenerate({
        setting: join(dir, "ktzm-setting.json"),
        templatePath: join(dir, "template.txt"),
        outputPath: join(dir, "output.txt"),
        answers: ["count=21"],
      });

      expect(await Bun.file(join(dir, "output.txt")).text()).toBe("42\n");
    });
  });

  test("--answers supplies select answer accessible as ktzm.answer", async () => {
    await withTempDir(async (dir) => {
      const setting = {
        questions: [
          {
            name: "mode",
            kind: "select",
            message: "Mode?",
            options: [
              { label: "Fast", value: "fast" },
              { label: "Slow", value: "slow" },
            ],
          },
        ],
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
      writeFileSync(join(dir, "template.txt"), "_V_ktzm.answer.mode_\n", "utf-8");

      await runGenerate({
        setting: join(dir, "ktzm-setting.json"),
        templatePath: join(dir, "template.txt"),
        outputPath: join(dir, "output.txt"),
        answers: ["mode=slow"],
      });

      expect(await Bun.file(join(dir, "output.txt")).text()).toBe("slow\n");
    });
  });

  test("uses question default when no answer provided (non-interactive)", async () => {
    await withTempDir(async (dir) => {
      const setting = {
        questions: [
          { name: "greeting", kind: "text", type: "string", message: "Greeting?", default: "hi" },
        ],
        files: [
          {
            pattern: "*.txt",
            tagDefinition: { value: [{ start: "_V_", end: "_" }] },
          },
        ],
      };
      writeFileSync(join(dir, "ktzm-setting.json"), JSON.stringify(setting), "utf-8");
      writeFileSync(join(dir, "template.txt"), "_V_ktzm.answer.greeting_\n", "utf-8");

      // process.stdin.isTTY is falsy in test environment (non-interactive)
      await runGenerate({
        setting: join(dir, "ktzm-setting.json"),
        templatePath: join(dir, "template.txt"),
        outputPath: join(dir, "output.txt"),
      });

      expect(await Bun.file(join(dir, "output.txt")).text()).toBe("hi\n");
    });
  });

  test("throws when no answer and no default in non-interactive mode", async () => {
    await withTempDir(async (dir) => {
      const setting = {
        questions: [
          { name: "required", kind: "text", type: "string", message: "Required?" },
        ],
        files: [
          {
            pattern: "*.txt",
            tagDefinition: { value: [{ start: "_V_", end: "_" }] },
          },
        ],
      };
      writeFileSync(join(dir, "ktzm-setting.json"), JSON.stringify(setting), "utf-8");
      writeFileSync(join(dir, "template.txt"), "_V_ktzm.answer.required_\n", "utf-8");

      await expect(
        runGenerate({
          setting: join(dir, "ktzm-setting.json"),
          templatePath: join(dir, "template.txt"),
          outputPath: join(dir, "output.txt"),
        })
      ).rejects.toThrow(KatazomeError);
    });
  });

  test("throws when --answer number value is not numeric", async () => {
    await withTempDir(async (dir) => {
      const setting = {
        questions: [
          { name: "count", kind: "text", type: "number", message: "Count?" },
        ],
        files: [
          {
            pattern: "*.txt",
            tagDefinition: { value: [{ start: "_V_", end: "_" }] },
          },
        ],
      };
      writeFileSync(join(dir, "ktzm-setting.json"), JSON.stringify(setting), "utf-8");
      writeFileSync(join(dir, "template.txt"), "_V_ktzm.answer.count_\n", "utf-8");

      await expect(
        runGenerate({
          setting: join(dir, "ktzm-setting.json"),
          templatePath: join(dir, "template.txt"),
          outputPath: join(dir, "output.txt"),
          answers: ["count=notanumber"],
        })
      ).rejects.toThrow(KatazomeError);
    });
  });

  test("throws when --answer select value does not match any option", async () => {
    await withTempDir(async (dir) => {
      const setting = {
        questions: [
          {
            name: "mode",
            kind: "select",
            message: "Mode?",
            options: [{ label: "Fast", value: "fast" }],
          },
        ],
        files: [
          {
            pattern: "*.txt",
            tagDefinition: { value: [{ start: "_V_", end: "_" }] },
          },
        ],
      };
      writeFileSync(join(dir, "ktzm-setting.json"), JSON.stringify(setting), "utf-8");
      writeFileSync(join(dir, "template.txt"), "_V_ktzm.answer.mode_\n", "utf-8");

      await expect(
        runGenerate({
          setting: join(dir, "ktzm-setting.json"),
          templatePath: join(dir, "template.txt"),
          outputPath: join(dir, "output.txt"),
          answers: ["mode=unknown"],
        })
      ).rejects.toThrow(KatazomeError);
    });
  });
});

describe("runGenerate output directory mode (file input)", () => {
  test("trailing slash on output path treats it as directory (creates template-named file)", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "hello.txt");
      const outputDir = join(dir, "out");

      writeFileSync(join(dir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(templatePath, "hello\n", "utf-8");

      await runGenerate({ templatePath, outputPath: outputDir + "/" });

      expect(existsSync(join(outputDir, "hello.txt"))).toBe(true);
      expect(await Bun.file(join(outputDir, "hello.txt")).text()).toBe("hello\n");
    });
  });

  test("existing directory as output path treats it as directory", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "hello.txt");
      const outputDir = join(dir, "out");
      mkdirSync(outputDir, { recursive: true });

      writeFileSync(join(dir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(templatePath, "hello\n", "utf-8");

      await runGenerate({ templatePath, outputPath: outputDir });

      expect(existsSync(join(outputDir, "hello.txt"))).toBe(true);
      expect(await Bun.file(join(outputDir, "hello.txt")).text()).toBe("hello\n");
    });
  });

  test("throws when directory input with existing file as output path", async () => {
    await withTempDir(async (dir) => {
      const inputDir = join(dir, "src");
      const outputPath = join(dir, "output.txt");
      mkdirSync(inputDir, { recursive: true });

      writeFileSync(join(inputDir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(join(inputDir, "hello.txt"), "hello\n", "utf-8");
      writeFileSync(outputPath, "existing content\n", "utf-8");

      await expect(
        runGenerate({ templatePath: inputDir, outputPath })
      ).rejects.toThrow(KatazomeError);
    });
  });
});

describe("runGenerate ktzm.outputFilePath", () => {
  test("ktzm.outputFilePath initial value equals template filename in directory mode", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "hello.txt");
      const outputDir = join(dir, "out");

      writeFileSync(join(dir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(templatePath, "/*{% ktzm.out(ktzm.outputFilePath); %}*/", "utf-8");

      await runGenerate({ templatePath, outputPath: outputDir + "/" });

      expect(await Bun.file(join(outputDir, "hello.txt")).text()).toBe("hello.txt");
    });
  });

  test("setting ktzm.outputFilePath changes the output filename in directory mode", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "hello.txt");
      const outputDir = join(dir, "out");

      writeFileSync(join(dir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(templatePath, "/*{% ktzm.outputFilePath = 'renamed.txt'; %}*/hello\n", "utf-8");

      await runGenerate({ templatePath, outputPath: outputDir + "/" });

      expect(existsSync(join(outputDir, "renamed.txt"))).toBe(true);
      expect(await Bun.file(join(outputDir, "renamed.txt")).text()).toBe("hello\n");
      expect(existsSync(join(outputDir, "hello.txt"))).toBe(false);
    });
  });

  test("ktzm.outputFilePath supports subpath in directory mode", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "hello.txt");
      const outputDir = join(dir, "out");

      writeFileSync(join(dir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(templatePath, "/*{% ktzm.outputFilePath = 'sub/renamed.txt'; %}*/hello\n", "utf-8");

      await runGenerate({ templatePath, outputPath: outputDir + "/" });

      expect(existsSync(join(outputDir, "sub", "renamed.txt"))).toBe(true);
      expect(await Bun.file(join(outputDir, "sub", "renamed.txt")).text()).toBe("hello\n");
    });
  });

  test("last assignment to ktzm.outputFilePath wins", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "hello.txt");
      const outputDir = join(dir, "out");

      writeFileSync(join(dir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(
        templatePath,
        "/*{% ktzm.outputFilePath = 'first.txt'; ktzm.outputFilePath = 'last.txt'; %}*/hello\n",
        "utf-8"
      );

      await runGenerate({ templatePath, outputPath: outputDir + "/" });

      expect(existsSync(join(outputDir, "last.txt"))).toBe(true);
      expect(existsSync(join(outputDir, "first.txt"))).toBe(false);
    });
  });

  test("ktzm.outputFilePath outside directory causes template execution error", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "hello.txt");
      const outputDir = join(dir, "out");

      writeFileSync(join(dir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(templatePath, "/*{% ktzm.outputFilePath = '../escape.txt'; %}*/hello\n", "utf-8");

      await expect(
        runGenerate({ templatePath, outputPath: outputDir + "/" })
      ).rejects.toThrow(KatazomeError);
    });
  });

  test("setting ktzm.outputFilePath in file mode does not affect output path", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "hello.txt");
      const outputPath = join(dir, "output.txt");

      writeFileSync(join(dir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(templatePath, "/*{% ktzm.outputFilePath = 'renamed.txt'; %}*/hello\n", "utf-8");

      await runGenerate({ templatePath, outputPath });

      expect(existsSync(outputPath)).toBe(true);
      expect(await Bun.file(outputPath).text()).toBe("hello\n");
      expect(existsSync(join(dir, "renamed.txt"))).toBe(false);
    });
  });

  test("ktzm.outputFilePath initial value in file mode equals template filename", async () => {
    await withTempDir(async (dir) => {
      const templatePath = join(dir, "hello.txt");
      const outputPath = join(dir, "output.txt");

      writeFileSync(join(dir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(templatePath, "/*{% ktzm.out(ktzm.outputFilePath); %}*/", "utf-8");

      await runGenerate({ templatePath, outputPath });

      expect(await Bun.file(outputPath).text()).toBe("hello.txt");
    });
  });

  test("ktzm.outputFilePath initial value includes subpath in directory-input mode", async () => {
    await withTempDir(async (dir) => {
      const inputDir = join(dir, "src");
      const outputDir = join(dir, "out");
      mkdirSync(join(inputDir, "sub"), { recursive: true });

      writeFileSync(join(inputDir, "ktzm-setting.json"), settingJson, "utf-8");
      writeFileSync(
        join(inputDir, "sub", "hello.txt"),
        "/*{% ktzm.out(ktzm.outputFilePath); %}*/",
        "utf-8"
      );

      await runGenerate({ templatePath: inputDir, outputPath: outputDir + "/" });

      expect(await Bun.file(join(outputDir, "sub", "hello.txt")).text()).toBe("sub/hello.txt");
    });
  });
});

describe("runGenerate imports", () => {
  test("user import is callable from a value tag", async () => {
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
      const templatePath = join(dir, "template.txt");
      const outputPath = join(dir, "output.txt");
      writeFileSync(join(dir, "ktzm-setting.json"), JSON.stringify(setting), "utf-8");
      writeFileSync(templatePath, "_V_helpers.greet('world')_\n", "utf-8");

      await runGenerate({ templatePath, outputPath });

      expect(await Bun.file(outputPath).text()).toBe("Hello, world\n");
    });
  });
});

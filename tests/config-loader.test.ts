import { describe, expect, test, spyOn } from "bun:test";
import { loadSetting } from "../src/config/loader.ts";
import { KatazomeError } from "../src/errors.ts";

const fixturesDir = new URL("./fixtures/settings/", import.meta.url).pathname;

describe("loadSetting", () => {
  // -------------------------------------------------------------------------
  // Basic file handling
  // -------------------------------------------------------------------------

  test("loads .yaml setting file", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.yaml`);
    expect(setting.tagDefinition.code).toHaveLength(2);
    expect(setting.tagDefinition.code[0]).toEqual({ start: "/*{%", end: "%}*/" });
    expect(setting.tagDefinition.code[1]).toEqual({ start: "/*{%-", end: "-%}*/", trim: "both" });
  });

  test("loads .toml setting file", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.toml`);
    expect(setting.tagDefinition.code).toHaveLength(2);
    expect(setting.tagDefinition.code[0]).toEqual({ start: "/*{%", end: "%}*/" });
    expect(setting.tagDefinition.code[1]).toEqual({ start: "/*{%-", end: "-%}*/", trim: "both" });
  });

  test("loads .json5 setting file with comments", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.json5`);
    expect(setting.tagDefinition.code).toHaveLength(2);
    expect(setting.tagDefinition.comment).toHaveLength(1);
  });

  test("falls back to JSON5 for unknown extension", async () => {
    const settingJson = '{ tagDefinition: { code: [{ start: "<%", end: "%>" }] } }';
    const tmpPath = `${import.meta.dir}/tmp-unknown-ext.ktzm`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.tagDefinition.code).toHaveLength(1);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("throws on non-existent file", async () => {
    await expect(loadSetting("/non/existent/path.json")).rejects.toThrow(KatazomeError);
  });

  test("throws when root is not an object", async () => {
    await expect(loadSetting(`${fixturesDir}invalid.json`)).rejects.toThrow(KatazomeError);
  });

  // -------------------------------------------------------------------------
  // Common tagDefinition
  // -------------------------------------------------------------------------

  test("loads common tagDefinition", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.json`);

    expect(setting.tagDefinition.code).toHaveLength(2);
    expect(setting.tagDefinition.code[0]).toEqual({ start: "/*{%", end: "%}*/" });
    expect(setting.tagDefinition.code[1]).toEqual({ start: "/*{%-", end: "-%}*/", trim: "both" });
    expect(setting.tagDefinition.value).toHaveLength(0);
    expect(setting.tagDefinition.comment).toHaveLength(1);
  });

  test("omitting tagDefinition gives all-empty common definition", async () => {
    const setting = await loadSetting(`${fixturesDir}inherit-false.json`);

    expect(setting.tagDefinition.code).toHaveLength(0);
    expect(setting.tagDefinition.value).toHaveLength(0);
    expect(setting.tagDefinition.comment).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // files array
  // -------------------------------------------------------------------------

  test("loads file-pattern-specific tagDefinition", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.json`);

    const cEntry = setting.files.find((f) => f.pattern === "*.c");
    expect(cEntry).toBeDefined();
    expect(cEntry!.tagDefinition.value).toHaveLength(2);
    expect(cEntry!.tagDefinition.value[0]).toEqual({ start: "_V_", end: "_" });
    expect(cEntry!.tagDefinition.value[1]).toEqual({ start: "_V(\"", end: "\")" });
  });

  test("inherit defaults to true when omitted", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.json`);
    const cEntry = setting.files.find((f) => f.pattern === "*.c");
    expect(cEntry?.tagDefinition.inherit).toBe(true);
  });

  test("inherit: false is preserved", async () => {
    const setting = await loadSetting(`${fixturesDir}inherit-false.json`);
    expect(setting.files[0]?.tagDefinition.inherit).toBe(false);
  });

  test("files array order is preserved", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.json`);
    expect(setting.files).toHaveLength(2);
    expect(setting.files[0]?.pattern).toBe("*.c");
    expect(setting.files[1]?.pattern).toBe("*.ts");
  });

  test("omitting files gives empty files array", async () => {
    const settingJson = JSON.stringify({
      tagDefinition: { code: [{ start: "<%", end: "%>" }] },
    });
    const tmpPath = `${import.meta.dir}/tmp-no-files.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.files).toHaveLength(0);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  // -------------------------------------------------------------------------
  // existingFile
  // -------------------------------------------------------------------------

  test("existingFile is undefined when omitted at root", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.json`);
    expect(setting.existingFile).toBeUndefined();
  });

  test("existingFile is loaded at root level", async () => {
    const settingJson = JSON.stringify({
      existingFile: "skip",
    });
    const tmpPath = `${import.meta.dir}/tmp-existing-file.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.existingFile).toBe("skip");
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("existingFile is loaded per file pattern", async () => {
    const settingJson = JSON.stringify({
      files: [{ pattern: "package.json", existingFile: "skip" }],
    });
    const tmpPath = `${import.meta.dir}/tmp-per-file-existing.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.files[0]?.existingFile).toBe("skip");
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("throws on invalid existingFile value", async () => {
    const settingJson = JSON.stringify({ existingFile: "replace" });
    const tmpPath = `${import.meta.dir}/tmp-bad-existing.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await expect(loadSetting(tmpPath)).rejects.toThrow(KatazomeError);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  // -------------------------------------------------------------------------
  // exclude
  // -------------------------------------------------------------------------

  test("exclude is empty array when omitted", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.json`);
    expect(setting.exclude).toEqual([]);
  });

  test("exclude patterns are loaded", async () => {
    const settingJson = JSON.stringify({
      exclude: [".DS_Store", "*.local.*"],
    });
    const tmpPath = `${import.meta.dir}/tmp-exclude.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.exclude).toEqual([".DS_Store", "*.local.*"]);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("throws when exclude is not an array", async () => {
    const settingJson = JSON.stringify({ exclude: ".DS_Store" });
    const tmpPath = `${import.meta.dir}/tmp-bad-exclude.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await expect(loadSetting(tmpPath)).rejects.toThrow(KatazomeError);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  // -------------------------------------------------------------------------
  // imports
  // -------------------------------------------------------------------------

  test("imports is undefined when omitted", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.json`);
    expect(setting.imports).toBeUndefined();
  });

  test("loads root-level imports", async () => {
    const settingJson = JSON.stringify({
      imports: {
        paths: [
          { path: "./helpers.ts", as: "helpers" },
          { path: "../shared/utils.ts", as: "myUtils" },
        ],
      },
    });
    const tmpPath = `${import.meta.dir}/tmp-root-imports.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.imports?.paths).toHaveLength(2);
      expect(setting.imports?.paths[0]).toEqual({ path: "./helpers.ts", as: "helpers" });
      expect(setting.imports?.paths[1]).toEqual({ path: "../shared/utils.ts", as: "myUtils" });
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("root imports with empty paths array", async () => {
    const settingJson = JSON.stringify({ imports: { paths: [] } });
    const tmpPath = `${import.meta.dir}/tmp-root-imports-empty.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.imports?.paths).toHaveLength(0);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("loads file-pattern-level imports with inherit: true", async () => {
    const settingJson = JSON.stringify({
      files: [
        {
          pattern: "*.c",
          imports: {
            inherit: true,
            paths: [{ path: "./c-helpers.ts", as: "cHelpers" }],
          },
        },
      ],
    });
    const tmpPath = `${import.meta.dir}/tmp-file-imports-inherit-true.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.files[0]?.imports?.inherit).toBe(true);
      expect(setting.files[0]?.imports?.paths).toHaveLength(1);
      expect(setting.files[0]?.imports?.paths[0]).toEqual({ path: "./c-helpers.ts", as: "cHelpers" });
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("file-pattern imports: inherit defaults to true when omitted", async () => {
    const settingJson = JSON.stringify({
      files: [
        {
          pattern: "*.c",
          imports: { paths: [{ path: "./c-helpers.ts", as: "cHelpers" }] },
        },
      ],
    });
    const tmpPath = `${import.meta.dir}/tmp-file-imports-inherit-default.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.files[0]?.imports?.inherit).toBe(true);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("file-pattern imports: inherit: false is preserved", async () => {
    const settingJson = JSON.stringify({
      files: [
        {
          pattern: "*.c",
          imports: {
            inherit: false,
            paths: [{ path: "./c-helpers.ts", as: "cHelpers" }],
          },
        },
      ],
    });
    const tmpPath = `${import.meta.dir}/tmp-file-imports-inherit-false.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.files[0]?.imports?.inherit).toBe(false);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("file-pattern imports is undefined when omitted", async () => {
    const settingJson = JSON.stringify({
      files: [{ pattern: "*.c" }],
    });
    const tmpPath = `${import.meta.dir}/tmp-file-imports-absent.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.files[0]?.imports).toBeUndefined();
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("throws when as is 'ktzm'", async () => {
    const settingJson = JSON.stringify({
      imports: { paths: [{ path: "./helpers.ts", as: "ktzm" }] },
    });
    const tmpPath = `${import.meta.dir}/tmp-imports-reserved-as.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await expect(loadSetting(tmpPath)).rejects.toThrow(KatazomeError);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("throws when import entry path is missing", async () => {
    const settingJson = JSON.stringify({
      imports: { paths: [{ as: "helpers" }] },
    });
    const tmpPath = `${import.meta.dir}/tmp-imports-no-path.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await expect(loadSetting(tmpPath)).rejects.toThrow(KatazomeError);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("throws when import entry as is missing", async () => {
    const settingJson = JSON.stringify({
      imports: { paths: [{ path: "./helpers.ts" }] },
    });
    const tmpPath = `${import.meta.dir}/tmp-imports-no-as.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await expect(loadSetting(tmpPath)).rejects.toThrow(KatazomeError);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("throws when root imports is not an object", async () => {
    const settingJson = JSON.stringify({
      imports: [{ path: "./helpers.ts", as: "helpers" }],
    });
    const tmpPath = `${import.meta.dir}/tmp-imports-array.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await expect(loadSetting(tmpPath)).rejects.toThrow(KatazomeError);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  // -------------------------------------------------------------------------
  // Duplicate start string detection
  // -------------------------------------------------------------------------

  test("throws on duplicate start strings within the same kind", async () => {
    await expect(
      loadSetting(`${fixturesDir}duplicate-start.json`)
    ).rejects.toThrow(KatazomeError);
  });

  test("throws on duplicate start strings across different kinds", async () => {
    await expect(
      loadSetting(`${fixturesDir}duplicate-start-cross-kind.json`)
    ).rejects.toThrow(KatazomeError);
  });

  test("throws on duplicate start strings between common and file-pattern definition (inherit: true)", async () => {
    await expect(
      loadSetting(`${fixturesDir}duplicate-start-with-common.json`)
    ).rejects.toThrow(KatazomeError);
  });

  test("allows identical start strings in different file patterns", async () => {
    // c-style.json: "*.c" and "*.ts" both inherit the common code/comment definitions
    // which have the same start strings — this is valid (no cross-pattern check).
    await expect(loadSetting(`${fixturesDir}c-style.json`)).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Unknown key warnings
  // -------------------------------------------------------------------------

  test("warns on unknown key at root level", async () => {
    const spy = spyOn(console, "warn");
    const settingJson = JSON.stringify({ unknownKey: 123 });
    const tmpPath = `${import.meta.dir}/tmp-unknown-root.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await loadSetting(tmpPath);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('"unknownKey"'));
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
      spy.mockRestore();
    }
  });

  test("warns on unknown key in tagDefinition", async () => {
    const spy = spyOn(console, "warn");
    const settingJson = JSON.stringify({
      tagDefinition: { typo: [], code: [{ start: "<%", end: "%>" }] },
    });
    const tmpPath = `${import.meta.dir}/tmp-unknown-tagdef.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await loadSetting(tmpPath);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('"typo"'));
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
      spy.mockRestore();
    }
  });

  test("warns on unknown key in file-pattern tagDefinition", async () => {
    const spy = spyOn(console, "warn");
    const settingJson = JSON.stringify({
      files: [
        { pattern: "*.c", tagDefinition: { inherrit: false, code: [{ start: "<%", end: "%>" }] } },
      ],
    });
    const tmpPath = `${import.meta.dir}/tmp-unknown-file-tagdef.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await loadSetting(tmpPath);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('"inherrit"'));
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
      spy.mockRestore();
    }
  });

  // -------------------------------------------------------------------------
  // Questions validation
  // -------------------------------------------------------------------------

  test("parses text question with type and default", async () => {
    const settingJson = JSON.stringify({
      questions: [
        { name: "propName", kind: "text", type: "string", message: "Property name?", default: "foo" },
      ],
    });
    const tmpPath = `${import.meta.dir}/tmp-questions-text.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.questions).toHaveLength(1);
      const q = setting.questions![0]!;
      expect(q.kind).toBe("text");
      expect(q.name).toBe("propName");
      if (q.kind === "text") {
        expect(q.type).toBe("string");
        expect(q.default).toBe("foo");
      }
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("parses select question with options", async () => {
    const settingJson = JSON.stringify({
      questions: [
        {
          name: "propType",
          kind: "select",
          message: "Property type?",
          options: [
            { label: "Getter only", value: 10 },
            { label: "Getter and setter", value: 20 },
          ],
          default: 10,
        },
      ],
    });
    const tmpPath = `${import.meta.dir}/tmp-questions-select.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      const q = setting.questions![0]!;
      expect(q.kind).toBe("select");
      if (q.kind === "select") {
        expect(q.options).toHaveLength(2);
        expect(q.options[0]!.label).toBe("Getter only");
        expect(q.default).toBe(10);
      }
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("throws on duplicate question names", async () => {
    const settingJson = JSON.stringify({
      questions: [
        { name: "foo", kind: "text", type: "string", message: "First?" },
        { name: "foo", kind: "text", type: "string", message: "Second?" },
      ],
    });
    const tmpPath = `${import.meta.dir}/tmp-questions-dup-name.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await expect(loadSetting(tmpPath)).rejects.toThrow(KatazomeError);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("throws when text question has options field", async () => {
    const settingJson = JSON.stringify({
      questions: [
        { name: "foo", kind: "text", type: "string", message: "Msg?", options: [] },
      ],
    });
    const tmpPath = `${import.meta.dir}/tmp-questions-text-options.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await expect(loadSetting(tmpPath)).rejects.toThrow(KatazomeError);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("throws when select question has type field", async () => {
    const settingJson = JSON.stringify({
      questions: [
        { name: "foo", kind: "select", type: "string", message: "Msg?", options: [{ label: "A", value: 1 }] },
      ],
    });
    const tmpPath = `${import.meta.dir}/tmp-questions-select-type.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await expect(loadSetting(tmpPath)).rejects.toThrow(KatazomeError);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("throws when select question has empty options", async () => {
    const settingJson = JSON.stringify({
      questions: [
        { name: "foo", kind: "select", message: "Msg?", options: [] },
      ],
    });
    const tmpPath = `${import.meta.dir}/tmp-questions-empty-options.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      await expect(loadSetting(tmpPath)).rejects.toThrow(KatazomeError);
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });

  test("questions is undefined when omitted", async () => {
    const settingJson = JSON.stringify({ files: [] });
    const tmpPath = `${import.meta.dir}/tmp-questions-absent.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(setting.questions).toBeUndefined();
    } finally {
      await Bun.spawn(["rm", "-f", tmpPath]).exited;
    }
  });
});

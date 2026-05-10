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
});

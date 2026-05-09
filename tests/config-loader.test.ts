import { describe, expect, test, spyOn, beforeEach, afterEach } from "bun:test";
import { loadSetting } from "../src/config/loader.ts";
import { KatazomeError } from "../src/errors.ts";

const fixturesDir = new URL("./fixtures/settings/", import.meta.url).pathname;

describe("loadSetting", () => {
  // -------------------------------------------------------------------------
  // Basic file handling
  // -------------------------------------------------------------------------

  test("throws on unsupported file extension", async () => {
    await expect(loadSetting("/some/file.yaml")).rejects.toThrow(KatazomeError);
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
  // extensions
  // -------------------------------------------------------------------------

  test("loads extension-specific tagDefinition", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.json`);

    const cTagDef = setting.extensions["c"]?.tagDefinition;
    expect(cTagDef).toBeDefined();
    expect(cTagDef!.value).toHaveLength(2);
    expect(cTagDef!.value[0]).toEqual({ start: "_V_", end: "_" });
    expect(cTagDef!.value[1]).toEqual({ start: "_V(\"", end: "\")" });
  });

  test("inherit defaults to true when omitted", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.json`);
    expect(setting.extensions["c"]?.tagDefinition.inherit).toBe(true);
  });

  test("inherit: false is preserved", async () => {
    const setting = await loadSetting(`${fixturesDir}inherit-false.json`);
    expect(setting.extensions["c"]?.tagDefinition.inherit).toBe(false);
  });

  test("extension keys are normalized to lowercase", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.json`);
    expect("c" in setting.extensions).toBe(true);
    expect("ts" in setting.extensions).toBe(true);
  });

  test("omitting extensions gives empty extensions map", async () => {
    const settingJson = JSON.stringify({
      tagDefinition: { code: [{ start: "<%", end: "%>" }] },
    });
    const tmpPath = `${import.meta.dir}/tmp-no-extensions.json`;
    await Bun.write(tmpPath, settingJson);
    try {
      const setting = await loadSetting(tmpPath);
      expect(Object.keys(setting.extensions)).toHaveLength(0);
    } finally {
      await Bun.file(tmpPath).exists().then(() =>
        Bun.spawn(["rm", "-f", tmpPath]).exited
      );
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

  test("throws on duplicate start strings between common and extension definition (inherit: true)", async () => {
    await expect(
      loadSetting(`${fixturesDir}duplicate-start-with-common.json`)
    ).rejects.toThrow(KatazomeError);
  });

  test("allows identical start strings in different extensions", async () => {
    // c-style.json: "c" and "ts" both inherit the common code/comment definitions
    // which have the same start strings — this is valid (no cross-extension check).
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

  test("warns on unknown key in extension tagDefinition", async () => {
    const spy = spyOn(console, "warn");
    const settingJson = JSON.stringify({
      extensions: {
        c: { tagDefinition: { inherrit: false, code: [{ start: "<%", end: "%>" }] } },
      },
    });
    const tmpPath = `${import.meta.dir}/tmp-unknown-ext-tagdef.json`;
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

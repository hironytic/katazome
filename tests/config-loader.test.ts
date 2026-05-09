import { describe, expect, test } from "bun:test";
import { loadSetting } from "../src/config/loader.ts";
import { KatazomeError } from "../src/errors.ts";

const fixturesDir = new URL("./fixtures/settings/", import.meta.url).pathname;

describe("loadSetting", () => {
  test("loads a valid JSON setting file", async () => {
    const setting = await loadSetting(`${fixturesDir}c-style.json`);
    expect(setting.tagDefinition).toBeDefined();
    expect(setting.tagDefinition["c"]).toBeDefined();

    const cDef = setting.tagDefinition["c"]!;
    expect(cDef.code).toHaveLength(2);
    expect(cDef.code[0]).toEqual({ start: "/*{%", end: "%}*/" });
    expect(cDef.code[1]).toEqual({ start: "/*{%-", end: "-%}*/", trim: "both" });
    expect(cDef.value).toHaveLength(2);
    expect(cDef.comment).toHaveLength(1);
  });

  test("throws on missing tagDefinition", async () => {
    await expect(loadSetting(`${fixturesDir}invalid.json`)).rejects.toThrow(KatazomeError);
  });

  test("throws on unsupported file extension", async () => {
    await expect(loadSetting("/some/file.yaml")).rejects.toThrow(KatazomeError);
  });

  test("throws on non-existent file", async () => {
    await expect(loadSetting("/non/existent/path.json")).rejects.toThrow(KatazomeError);
  });

  test("throws on duplicate start strings within the same kind", async () => {
    await expect(loadSetting(`${fixturesDir}duplicate-start.json`)).rejects.toThrow(KatazomeError);
  });

  test("throws on duplicate start strings across different kinds", async () => {
    await expect(loadSetting(`${fixturesDir}duplicate-start-cross-kind.json`)).rejects.toThrow(KatazomeError);
  });

  test("allows identical start strings in different extensions", async () => {
    // c-style.json defines the same start strings for both "c" and "ts" extensions — this is valid.
    await expect(loadSetting(`${fixturesDir}c-style.json`)).resolves.toBeDefined();
  });
});

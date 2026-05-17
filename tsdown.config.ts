import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts"],
  outDir: "dist",
  format: "esm",
  target: "node24",
  platform: "node",
  clean: true,
  deps: {
    onlyBundle: ["commander", "json5", "yaml"],
  },
});

import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm", "cjs"],
  dts: {
    compilerOptions: {
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
    },
  },
  clean: true,
  sourcemap: true,
  shims: true,
  treeshake: true,
  splitting: true,
  platform: "node",
  outDir: "dist",
  ignoreWatch: ["test/**"],
});

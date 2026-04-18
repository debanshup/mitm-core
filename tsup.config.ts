import { defineConfig } from "tsup";

export default defineConfig([
  // main bundle
  {
    entry: {
      index: "src/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    shims: true,
    treeshake: true,
    splitting: true,
    platform: "node",
    outDir: "dist",
    ignoreWatch: ["example/**", "test/**"],
  },

  // worker bundle
  {
    entry: {
      Cert_Worker: "src/core/workers/Cert_Worker.ts",
    },
    format: ["esm"],
    dts: false,
    clean: false,
    sourcemap: true,
    shims: true,
    treeshake: true,
    platform: "node",
    outDir: "dist/workers",
  },
]);

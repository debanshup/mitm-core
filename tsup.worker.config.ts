import { defineConfig } from "tsup";

export default defineConfig({
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
});

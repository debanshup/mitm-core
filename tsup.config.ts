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
    ignoreWatch: ["test/**"],
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
    external: ["crypto", "node:crypto"],
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
  },

  // // Example bundle
  // {
  //   entry: {
  //     proxy: "example/with-plugin/proxy.ts",
  //     "workers/Cert_Worker": "src/core/workers/Cert_Worker.ts", // Added this line
  //   },
  //   format: ["esm"],
  //   dts: false,
  //   clean: false,
  //   sourcemap: true,
  //   shims: true,
  //   treeshake: false,
  //   platform: "node",
  //   outDir: "dist/example", // This will now create dist/example/proxy.js AND dist/example/workers/Cert_Worker.js
  //   external: ["crypto", "node:crypto"],
  //   banner: {
  //     js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  //   },
  // },
]);

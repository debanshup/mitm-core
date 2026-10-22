import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const requiredFiles = ["creds/__self__/CA.pem", "creds/__self__/key.pem"];

const missingFiles = requiredFiles.filter(
  (file) => !existsSync(path.join(projectRoot, file)),
);

if (missingFiles.length > 0) {
  console.error("\nMissing required CA certificate files:\n");

  for (const file of missingFiles) {
    console.error(`  - ${file}`);
  }

  console.error(
    "\nGenerate or restore these files before running tests or examples.\n",
  );

  process.exit(1);
}

console.log("CA certificate files check passed.");

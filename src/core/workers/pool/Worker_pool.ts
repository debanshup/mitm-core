import Piscina from "piscina";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const pool = new Piscina.Piscina({
  filename: path.resolve(
    __dirname,
    "../Cert_Worker.ts"
    // path to worker
  ),
  maxThreads: 2,
});

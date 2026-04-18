import Piscina from "piscina";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const _dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const ext = path.extname(__filename);
const isDev = ext.toLowerCase() === ".ts";
const workerPath = isDev
  ? path.resolve(_dirname, `../Cert_Worker.ts`)
  : path.resolve(_dirname, `./workers/Cert_Worker.js`);
export const pool = new Piscina.Piscina({
  filename: workerPath,
  maxThreads: 2,
});

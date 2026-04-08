import os from "os";
import path from "path";
export const LEAF_PATH = {
  CERT_DIR: path.join(os.homedir(), ".mitm-core"),
};

export const CA_PATH = {
  CA_DIR: path.join(process.cwd(), "creds/__self__"),
};

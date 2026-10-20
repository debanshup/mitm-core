import os from "os";
import path from "path";
export const TEST_LEAF_DIR = path.join(os.homedir(), ".mitm-core");

export const TEST_CA_DIR = path.join(process.cwd(), "creds/__self__");
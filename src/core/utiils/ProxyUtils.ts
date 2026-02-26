import type Stream from "node:stream";
import type { Destroyable } from "../types/types.ts";

export class ProxyUtils {
  static cleanUp(streams: Destroyable<Stream>[]) {
    streams.forEach((s) => {
      if (s && s.destroyed === false) {
        if (typeof s.destroy === "function") {
          s.destroy();
        } else if (typeof s.end === "function") {
          s.end();
        }
      }
    });
  }
}

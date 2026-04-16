import type Stream from "node:stream";
type Destroyable<T extends Stream> = T & {
  destroyed?: boolean;
  destroy: (error?: Error) => void;
  end?: () => void;
};

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

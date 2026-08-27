import type { Stream } from "node:stream";

type ProxyStream = Stream & {
  destroyed?: boolean;
  unpipe?: (dest?: any) => Stream;
  destroy?: (error?: Error) => Stream | void;
  end?: (cb?: () => void) => Stream | void;
};

export class ProxyUtils {
  static cleanUp(streams: ProxyStream[], error?: Error): void {
    for (const stream of streams) {
      if (stream && typeof stream.unpipe === "function") {
        try {
          stream.unpipe();
        } catch (unpipeError) {
          console.error("Failed to unpipe stream:", unpipeError);
        }
      }
    }

    for (const stream of streams) {
      if (!stream) continue;

      if (stream.destroyed !== true) {
        if (typeof stream.destroy === "function") {
          stream.destroy(error);
        } else if (typeof stream.end === "function") {
          stream.end();
        }
      }
    }
  }
}

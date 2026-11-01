import type { Stream } from "node:stream";

type ProxyStream = Stream & {
  destroyed?: boolean;
  unpipe?: (dest?: any) => Stream;
  destroy?: (error?: Error) => Stream | void;
  end?: (cb?: () => void) => Stream | void;
};

export class ProxyUtils {
  public static cleanUp(streams: ProxyStream[], error?: Error): void {
    for (const stream of streams) {
      if (!stream) continue;

      try {
        if (typeof stream.unpipe === "function") {
          stream.unpipe();
        }
      } catch (unpipeError) {
        console.error("[ProxyUtils] Failed to unpipe stream:", unpipeError);
      }
    }

    for (const stream of streams) {
      if (!stream || stream.destroyed === true) continue;

      try {
        if (typeof stream.destroy === "function") {
          stream.destroy(error);
        } else if (typeof stream.end === "function") {
          stream.end();
        }
      } catch (cleanupError) {
        console.error("[ProxyUtils] Failed to destroy stream:", cleanupError);
      }
    }
  }
}

import type { ProxyEventMap } from "../event-manager/proxy-events/proxyEvents.ts";

export abstract class BasePlugin<K extends keyof ProxyEventMap = any> {
  // force to explicitly define the proxy event
  abstract readonly event: K;

  abstract run(
    payload: ProxyEventMap[K] extends any[] ? ProxyEventMap[K][0] : never,
  ): Promise<void> | void;

  // debug
  get name(): string {
    return this.constructor.name;
  }
}

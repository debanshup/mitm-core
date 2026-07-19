import type { ProxyEventMap } from "../event-manager/proxy-events/proxyEvents";
import type { BasePlugin } from "../plugin-manager/BasePlugin";

export type AbortMessage = {
  message: string;
  plugin: BasePlugin;
  event: keyof ProxyEventMap | string;
};

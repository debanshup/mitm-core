import type { ProxyEventMap } from "../event/proxy-events/proxyEvents";
import type { BasePlugin } from "../plugin/BasePlugin";

export type AbortMessage = {
  message: string;
  plugin: BasePlugin<any>;
  event: keyof ProxyEventMap | string;
};

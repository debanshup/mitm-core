import type { Phase } from "../core/phase/Phase.ts";
import type { ProxyContext } from "../core/types/types.ts";
export type Plugin = {
  name: string;
  phase: Phase;
  order: number;
  execute(ctx: ProxyContext): Promise<void>;
  register(): void;
  unregister(): void;
  isRegistered(): boolean;
};

export class PluginRegistry {
  private static enabledPlugins = new Set<Plugin>();

  static registerPlugins(plugins: Plugin[]) {
    for (const plugin of plugins) {
      plugin.register();
      this.enabledPlugins.add(plugin);
    }
  }
  static unRegisterPlugins(plugins: Plugin[]) {
    for (const plugin of plugins) {
      plugin.unregister();
      this.enabledPlugins.delete(plugin);
    }
  }

  static getEnabledPlugins() {
    return this.enabledPlugins;
  }
}

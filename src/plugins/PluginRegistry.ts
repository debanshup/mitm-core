import type { Plugin } from "../types/types.ts";
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

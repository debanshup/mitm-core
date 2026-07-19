import type { ProxyConfig } from "./lib/Proxy";

 const configRegistry: Partial<ProxyConfig> = {};

export function registerGlobalConfig(config: ProxyConfig) {
  Object.assign(configRegistry, config);
}

/**
 * Gets the current global configuration.
 * Returns a Partial because it might be empty if called before initialization.
 */
export function getConfig(): Partial<ProxyConfig> {
  return configRegistry;
}


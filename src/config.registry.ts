import http from "node:http";
/**
 * Configuration options for the proxy server, controlling caching,
 * TLS certificate handling, default pipeline registration, and timeouts.
 */
export type ProxyConfig = {
  /**
   * Enables caching of generated TLS leaf certificates.
   *
   * @default true
   */
  useCertificateCache?: boolean;

  /**
   * Directory used to store cached TLS leaf certificates.
   *
   * @default "~/.mitm-core"
   */
  leafCacheDir?: string;

  /**
   * Enables caching of proxy responses to improve performance.
   *
   * @default false
   */
  useResponseCache?: boolean;

  /**
   * Determines whether the default request and response processing
   * pipelines are registered.
   *
   * @default true
   */
  useDefaultPipelines?: boolean;

  /**
   * Root Certificate Authority (CA) credentials used to sign generated
   * TLS leaf certificates during HTTPS interception.
   *
   * The certificate and private key must be compatible CA credentials.
   */
  rootCa?: {
    /** CA private key, provided as a PEM string or Buffer. */
    key: string | Buffer;

    /** CA certificate, provided as a PEM string or Buffer. */
    cert: string | Buffer;
  };

  /**
   * Maximum time, in milliseconds, to wait for the client to complete
   * the TLS ClientHello.
   *
   * @default 10000
   */
  handshakeTimeoutMs?: number;

  /**
   * Maximum time, in milliseconds, allowed for an upstream operation
   * before the configured timeout is reached.
   *
   * @default 30000
   */
  upstreamTimeoutMs?: number;

  /**
   * Maximum time, in milliseconds, to wait for plugin execution to finish.
   * Set to 0 to disable the timeout completely.
   *
   * @default 10000
   */
  pluginTimeoutMs?: number;
};

/**
 * Configuration options for creating a Proxy instance.
 *
 * Extends the proxy configuration with an optional existing HTTP server
 * to which the proxy can attach.
 */
export type ProxyOptions = ProxyConfig & {
  /**
   * An existing HTTP server to attach the proxy to.
   *
   * If omitted, the proxy creates a new HTTP server.
   */
  server?: http.Server;
};

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

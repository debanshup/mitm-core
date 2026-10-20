/**
 * Public entry point for mitm-core.
 *
 * Exposes the proxy API, plugin extension interfaces, request context types,
 * rule engine, and pipeline-abort utilities intended for package consumers.
 *
 * Internal implementation details, including event managers, emitters,
 * handlers, and configuration registries, are not exported from this module.
 */
import type { ProxyConfig, ProxyOptions } from "./config.registry";
import type {
  PluginEventMap,
  WsMessageContext,
} from "./core/event/plugin-events/pluginEvents";
import type { ProxyEventMap } from "./core/event/proxy-events/proxyEvents";
import { BasePlugin, type PluginPayload } from "./core/plugin/BasePlugin";
import { RuleEngine } from "./core/rule/RuleEngine";
import type { IRuleParser, WatchableRuleFile } from "./core/rule/ruleStore";
import type {
  RequestContext,
  RequestScope,
  RequestLifecycle,
  SessionContext,
  WebSocketContext,
} from "./core/scope/types";
import { PipelineAbortSignal } from "./core/signals/pipelineAbortSignal";
import type { AbortMessage } from "./core/signals/types";
import type { IProxy } from "./lib/Proxy";
import { Proxy } from "./lib/Proxy";

export { Proxy, BasePlugin, RuleEngine, PipelineAbortSignal };

export type {
  IProxy,
  ProxyConfig,
  ProxyOptions,
  RequestContext,
  RequestScope,
  RequestLifecycle,
  SessionContext,
  WebSocketContext,
  PluginEventMap,
  PluginPayload,
  WsMessageContext,
  ProxyEventMap,
  IRuleParser,
  WatchableRuleFile,
  AbortMessage,
};

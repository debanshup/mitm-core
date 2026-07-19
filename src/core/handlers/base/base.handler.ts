import type { ProxyConfig } from "../../../lib/Proxy";
import type { Phase } from "../../../phase/Phase";
import type { RequestScope } from "../../context-manager/types";

/**
 * An abstract base class for defining handler logic associated with a specific lifecycle {@link Phase}.
 * Subclasses must implement the `handle` method and provide their specific target `phase`.
 */
export abstract class BaseHandler {
  abstract readonly phase: Phase;
  abstract readonly config: ProxyConfig
  abstract handle(scope: RequestScope): Promise<void>;
  get name(): string {
    return this.constructor.name;
  }
  constructor() {}
}

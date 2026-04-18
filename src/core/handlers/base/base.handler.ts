import type { Phase } from "../../../phase/Phase";
import type { ProxyContext } from "../../context-manager/ContextManager";

/**
 * An abstract base class for defining handler logic associated with a specific lifecycle {@link Phase}.
 * Subclasses must implement the `handle` method and provide their specific target `phase`.
 */
export abstract class BaseHandler {
  abstract readonly phase: Phase;
  abstract handle(ctx: ProxyContext): Promise<void>;
  get name(): string {
    return this.constructor.name;
  }
  constructor() {}
}

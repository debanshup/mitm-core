import type { Phase } from "../../../phase/Phase.ts";
import type { ProxyContext } from "../../context-manager/ContextManager.ts";

export abstract class BaseHandler {
  abstract readonly phase: Phase;
  abstract handle(ctx: ProxyContext): Promise<void>;
  get name(): string {
    return this.constructor.name;
  }
  constructor() {}
}

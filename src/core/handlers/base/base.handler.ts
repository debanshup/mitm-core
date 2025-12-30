import type { Phase } from "../../phase/Phase.ts";
import type { ProxyContext } from "../../types/types.ts";

export abstract class BaseHandler {
  static phase: Phase;
  public static execute: (ctx: ProxyContext) => Promise<void>;
  protected constructor() {}
}

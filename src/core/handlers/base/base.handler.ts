import type { Phase } from "../../phase/Phase.ts";
import type { Destroyable, ProxyContext } from "../../types/types.ts";

export abstract class BaseHandler {
  static phase: Phase;
  public static handle: (ctx: ProxyContext) => Promise<void>;
  protected constructor() {}
}

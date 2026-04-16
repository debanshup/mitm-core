import type { BaseHandler } from "../base/base.handler.ts";
import * as handlers from "./index.ts";
export type HandlerConstructor = new () => BaseHandler;

export const HANDLERS = new Set<HandlerConstructor>(
  Object.values(handlers).filter((exportItem) => {
    //  only grab actual classes/functions
    return typeof exportItem === "function";
  }) as unknown as HandlerConstructor[],
);

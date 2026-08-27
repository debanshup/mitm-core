import type { Socket } from "node:net";

import type { Phase } from "../../phase/Phase";
import type { RequestScope } from "../scope/types";

import { BaseHandler } from "./base/base.handler";
import { getConfig } from "../../config.registry";
import { SocketGuard } from "../utils/SocketGuard";

export class TcpHandler extends BaseHandler {
  readonly config = getConfig();
  readonly phase: Phase = "tcp";

  async handle(scope: RequestScope): Promise<void> {
    const { session } = scope;
    const socket = session.socket;

    if (!socket || socket.destroyed) return;

    (socket as Socket).setNoDelay(true);

    SocketGuard.ensureCleanupGuards(socket as Socket);
  }
}

import { BasePlugin, type RequestScope } from "../../../src";
import {
  pluginEventManager,
  type WsMessageContext,
} from "../../../src/core/event/plugin-events/pluginEvents";

export class WsMockPlugin extends BasePlugin<"proxy:ws-client-message"> {
  readonly event = "proxy:ws-client-message";

  constructor() {
    super();
    // Bind the upstream listener to catch server responses
    pluginEventManager.on(
      "proxy:ws-upstream-message",
      this.handleUpstream.bind(this),
    );
  }

  async init() {
    console.info(`[WsMockPlugin] Initialised: ${this.name}`);
  }

  async cleanup(): Promise<void> {
    console.info(`[WsMockPlugin] Cleaned up: ${this.name}`);
  }

  async run({
    scope,
    messageContext,
  }: {
    scope: RequestScope;
    messageContext: WsMessageContext;
  }) {
    const text = messageContext.data.toString("utf8");

    console.log(
      `[WsMockPlugin] [Client -> Server] Intercepted text: "${text}"`,
    );

    if (text === "Hello from the pure HTTP/WS client!") {
      messageContext.data = Buffer.from(
        "Hello from the pure HTTP/WS client! [MUTATED BY PROXY]",
      );
      console.log(`[WsMockPlugin] [Mutation] Payload mutated successfully`);
    }
  }

  private async handleUpstream({
    scope,
    messageContext,
  }: {
    scope: RequestScope;
    messageContext: WsMessageContext;
  }) {
    if (!scope.request.target.host?.includes("localhost:5000")) return;

    const text = messageContext.data.toString("utf8");
    console.log(`[WsMockPlugin] [Server -> Client] Received text: "${text}"`);
  }
}

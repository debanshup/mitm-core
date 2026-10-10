import Pipeline from "../core/pipelines/PipelineCompiler";
import { connectionEvents } from "../core/event/connection-events/connectionEvents";
import { ScopeMutator } from "../core/scope/ScopeMutator";
import { proxyEventManager } from "../core/event/proxy-events/proxyEvents";
import { pluginEventManager } from "../core/event/plugin-events/pluginEvents";
import type { Proxy } from "../lib/Proxy";
import type { Socket } from "net";
import type { IncomingMessage, ServerResponse } from "http";
import type { Duplex } from "stream";
import type { RequestScope } from "../core/scope/types";

/**
 * Manages middleware registration and orchestrates the proxy connection lifecycle.
 * Configures event listeners to intercept network traffic, initializes request contexts,
 * and triggers the processing pipeline.
 */

export class Middleware {
  /**
   * Registers event listeners for various connection types (TCP, HTTP, CONNECT, HTTPS)
   * and initializes the proxy pipeline.
   *
   * @param options.initializePipelines - Whether to trigger pipeline compilation upon registration.
   */
  public static register({
    initializePipelines,
  }: {
    initializePipelines: boolean;
  }) {
    if (initializePipelines) {
      Pipeline.compile();
    } else {
      return;
    }

    const onTCP = async ({ socket }: { socket: Socket }) => {
      try {
        ScopeMutator.initializeSessionContext(socket);
        await proxyEventManager.emitAsync("connection:open", { socket });
      } catch (err) {
        throw err;
      }
    };

    const onConnect = async ({
      req,
      socket,
      head,
      scope,
    }: {
      scope: RequestScope;
      req: IncomingMessage;
      socket: Duplex;
      head: Buffer;
    }) => {
      try {
        const success = ScopeMutator.applyConnectState(
          scope,
          req,
          socket,
          head,
        );
        if (!success) return;

        await pluginEventManager.emitAsync("proxy:client-connect", { scope });
        await proxyEventManager.emitAsync("connect:request", {
          head,
          scope,
          socket,
        });

        await Pipeline.run(scope);
      } catch (err) {
        console.error(`[Middleware Fatal] Pipeline crash on CONNECT:`, err);
        ScopeMutator.failPipeline(scope);
        if (!socket.destroyed) socket.destroy();
      }
    };

    const onHttpPlain = async ({
      req,
      res,
      scope,
    }: {
      scope: RequestScope;
      req: IncomingMessage;
      res: ServerResponse;
    }) => {
      try {
        const success = ScopeMutator.applyHttpPlainState(scope, req, res);
        if (!success) return;

        await pluginEventManager.emitAsync("proxy:client-http-request", {
          scope,
        });
        await proxyEventManager.emitAsync("http:request", { scope });

        await Pipeline.run(scope);
      } catch (err) {
        console.error(`[Middleware Fatal] Pipeline crash on HTTP:PLAIN:`, err);
        ScopeMutator.failPipeline(scope);
        if (!res.destroyed) res.destroy();
      }
    };

    const onHttpsDecrypted = async ({ scope }: { scope: RequestScope }) => {
      try {
        const success = ScopeMutator.applyHttpsDecryptedState(scope);
        if (!success) return;
        await pluginEventManager.emitAsync("proxy:client-https-request", {
          scope,
        });
        await proxyEventManager.emitAsync("https:request", { scope });

        await Pipeline.run(scope);
      } catch (err) {
        console.error(
          `[Middleware Fatal] Pipeline crash on HTTPS:DECRYPTED:`,
          err,
        );
        ScopeMutator.failPipeline(scope);
        if (!scope.request.client.res?.destroyed)
          scope.request.client.res?.destroy();
      }
    };

    const onUpstreamResponse = async ({
      scope,
      upstreamRes,
    }: {
      scope: RequestScope;
      upstreamRes: IncomingMessage;
    }) => {
      const success = ScopeMutator.applyResponseState(scope, upstreamRes);
      if (!success) {
        return;
      }
      await pluginEventManager.emitAsync("proxy:target-response", { scope });
    };

    const onWsUpgrade = async ({
      head,
      req,
      scope,
      socket,
    }: {
      scope: RequestScope;
      req: IncomingMessage;
      socket: Duplex;
      head: Buffer;
    }) => {
      try {
        const wsScope = scope;

        const success = ScopeMutator.applyUpgradeState(
          wsScope,
          req,
          socket,
          head,
        );
        if (!success) return;
        await Pipeline.run(wsScope);
      } catch (error) {
        console.error(
          `[Middleware Fatal] Pipeline crash on WS:UPGRADE:`,
          error,
        );
        if (!socket.destroyed) socket.destroy();
      }
    };

    connectionEvents.on("TCP", onTCP);

    connectionEvents.on("HTTP:PLAIN", onHttpPlain);

    connectionEvents.on("CONNECT", onConnect);

    connectionEvents.on("HTTPS:DECRYPTED", onHttpsDecrypted);

    connectionEvents.on("WS:UPGRADE", onWsUpgrade);

    connectionEvents.on("UPSTREAM:RESPONSE", onUpstreamResponse);

    // let cleanedUp = false;

    // return () => {
    //   if (cleanedUp) return;

    //   cleanedUp = true;

    //   connectionEvents.off("TCP", onTCP);
    //   connectionEvents.off("CONNECT", onConnect);
    //   connectionEvents.off("HTTP:PLAIN", onHttpPlain);
    //   connectionEvents.off("HTTPS:DECRYPTED", onHttpsDecrypted);
    //   connectionEvents.off("UPSTREAM:RESPONSE", onUpstreamResponse);
    //   connectionEvents.off("WS:UPGRADE", onWsUpgrade);
    // };
  }
}

import Pipeline from "../core/pipelines/PipelineCompiler";
import { connectionEvents } from "../core/event/connection-events/connectionEvents";
import { ScopeMutator } from "../core/scope/ScopeMutator";
import { proxyEventManager } from "../core/event/proxy-events/proxyEvents";
import { pluginEventManager } from "../core/event/plugin-events/pluginEvents";

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

    // ------------------- proxy emitted events ------------------

    connectionEvents.on("TCP", async ({ socket }) => {
      try {
        const scope = ScopeMutator.initializeSessionScope(socket);
        await proxyEventManager.emitAsync("connection:open", { socket });

        await Pipeline.run(scope);
      } catch (err) {
        throw err;
      }
    });

    connectionEvents.on("HTTP:PLAIN", async ({ req, res, scope }) => {
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
        ScopeMutator.failPipeline(scope, err);
        if (!res.destroyed) res.destroy();
      }
    });

    connectionEvents.on("CONNECT", async ({ req, socket, head, scope }) => {
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
        ScopeMutator.failPipeline(scope, err);
        if (!socket.destroyed) socket.destroy();
      }
    });

    // ------------------- h1Inbound emitted events ------------------

    connectionEvents.on("HTTPS:DECRYPTED", async ({ scope }) => {
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
        ScopeMutator.failPipeline(scope, err);
        if (!scope.request.client.res?.destroyed)
          scope.request.client.res?.destroy();
      }
    });

    connectionEvents.on("WS:UPGRADE", async ({ head, req, scope, socket }) => {
      try {
        const wsScope = scope || ScopeMutator.initializeSessionScope(socket);
        
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
    });

    // -- upstream emitted events ------------------

    connectionEvents.on("UPSTREAM:INIT", async ({ scope, upstreamReq }) => {
      const success = ScopeMutator.applyUpstreamInitState(scope, upstreamReq);
      if (!success) {
        return;
      }
      await pluginEventManager.emitAsync("proxy:upstream-dispatch", { scope });
    });

    connectionEvents.on("UPSTREAM:RESPONSE", async ({ scope, upstreamRes }) => {
      const success = ScopeMutator.applyResponseState(scope, upstreamRes);
      if (!success) {
        return;
      }
      await pluginEventManager.emitAsync("proxy:target-response", { scope });
    });
  }
}

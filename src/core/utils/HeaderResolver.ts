import { getConfig } from "../../config.registry";
import type { RequestScope } from "../scope/types";

export class HeaderResolver {
  /**
   * Resolves the final request header set by layering incoming client headers,
   * global overrides, and per-request overrides, then applying deletions.
   */
  public static resolveRequestHeaders(
    scope: RequestScope,
  ): Record<string, any> {
    const originalHeaders = scope.request.client.req?.headers || {};

    const globalOverrides =
      getConfig().globalHeaderOverrides?.requestOverrides || {};
    const globalRemovals =
      getConfig().globalHeaderOverrides?.requestHeadersToRemove || [];

    const requestOverrides =
      scope.request.explicitHeaderOverrides?.requestOverrides || {};
    const requestRemovals =
      scope.request.explicitHeaderOverrides?.requestHeadersToRemove || [];

    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(originalHeaders)) {
      resolved[key.toLowerCase()] = value;
    }
    for (const [key, value] of Object.entries(globalOverrides)) {
      resolved[key.toLowerCase()] = value;
    }
    for (const [key, value] of Object.entries(requestOverrides)) {
      resolved[key.toLowerCase()] = value;
    }

    // Process explicit deletions (both global and per-request)
    for (const key of [...globalRemovals, ...requestRemovals]) {
      delete resolved[key.toLowerCase()];
    }

    // Cleanup any lingering null/undefined overrides
    for (const key of Object.keys(resolved)) {
      if (resolved[key] === undefined || resolved[key] === null) {
        delete resolved[key];
      }
    }

    return resolved;
  }

  /**
   * Resolves the final response header set by layering upstream response headers,
   * global overrides, and per-request overrides, then applying deletions.
   */
  public static resolveResponseHeaders(
    scope: RequestScope,
    upstreamHeaders: Record<string, any>,
  ): Record<string, any> {
    const globalOverrides =
      getConfig().globalHeaderOverrides?.responseOverrides || {};
    const globalRemovals =
      getConfig().globalHeaderOverrides?.responseHeadersToRemove || [];

    const requestOverrides =
      scope.request.explicitHeaderOverrides?.responseOverrides || {};
    const requestRemovals =
      scope.request.explicitHeaderOverrides?.responseHeadersToRemove || [];

    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(upstreamHeaders)) {
      resolved[key.toLowerCase()] = value;
    }
    for (const [key, value] of Object.entries(globalOverrides)) {
      resolved[key.toLowerCase()] = value;
    }
    for (const [key, value] of Object.entries(requestOverrides)) {
      resolved[key.toLowerCase()] = value;
    }

    // Process explicit deletions (both global and per-request)
    for (const key of [...globalRemovals, ...requestRemovals]) {
      delete resolved[key.toLowerCase()];
    }

    // Cleanup any lingering null/undefined overrides
    for (const key of Object.keys(resolved)) {
      if (resolved[key] === undefined || resolved[key] === null) {
        delete resolved[key];
      }
    }

    return resolved;
  }
}

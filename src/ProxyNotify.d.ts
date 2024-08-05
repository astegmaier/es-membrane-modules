import { ILogger } from "./Membrane";
import { ObjectGraphHandler } from "./ObjectGraphHandler";
import { IProxyParts } from "./ProxyMapping";

export interface ListenerMetadata {
  /**
   * The proxy or value the Membrane will return to the caller.
   *
   * @note If you set this property with a non-proxy value, the value will NOT
   * be protected by the membrane.
   *
   * If you wish to replace the proxy with another Membrane-based proxy,
   * including a new proxy with a chained proxy handler (see ModifyRulesAPI),
   * do NOT just call Proxy.revocable and set this property.  Instead, set the
   * handler property with the new proxy handler, and call .rebuildProxy().
   */
  proxy: object;

  /**
   * The unwrapped object or function we're building the proxy for.
   */
  target: object;

  isOriginGraph: boolean;

  /**
   * The proxy handler.  This should be an ObjectGraphHandler.
   */
  handler: ObjectGraphHandler;

  /**
   * A reference to the membrane logger, if there is one.
   */
  logger: ILogger;

  /**
   * Rebuild the proxy object.
   */
  rebuildProxy(): void;

  /**
   * Direct the membrane to use the shadow target instead of the full proxy.
   *
   * @param mode {String} One of several values:
   *   - "frozen" means return a frozen shadow target.
   *   - "sealed" means return a sealed shadow target.
   *   - "prepared" means return a shadow target with lazy getters for all
   *     available properties and for its prototype.
   */
  useShadowTarget(mode: UseShadowTargetMode): void;
}

export interface InvokedListenerMetadata {
  /**
   * Notify no more listeners.
   */
  stopIteration(): void;

  stopped: boolean;

  /**
   * Explicitly throw an exception from the listener, through the membrane.
   */
  throwException(exception: any): void;
}

export interface AllListenerMetadata extends ListenerMetadata, InvokedListenerMetadata {}

export type UseShadowTargetMode = "frozen" | "sealed" | "prepared";

/**
 * Notify all proxy listeners of a new proxy.
 *
 * @param parts    {IProxyParts} The field object from a ProxyMapping's proxiedFields.
 * @param handler  {ObjectGraphHandler} The handler for the proxy.
 * @param isOrigin {boolean} True if the handler is the origin graph handler.
 * @param options  {Object} Special options to pass on to the listeners.
 *q
 * @private
 */
export function ProxyNotify(
  parts: IProxyParts,
  handler: ObjectGraphHandler,
  isOrigin: boolean,
  options: any,
): void;

export declare module ProxyNotify {
  function useShadowTarget(
    this: AllListenerMetadata,
    parts: any,
    handler: ObjectGraphHandler,
    mode: UseShadowTargetMode,
  ): void;
}

export function invokeProxyListeners(listeners, meta): void;

import { assert } from "./assert";
import { DataDescriptor, AccessorDescriptor } from "./sharedUtilities";
import { ProxyMapping } from "./ProxyMapping";
import { makeRevokeDeleteRefs } from "./moduleUtilities";
import { throwAndLog } from "./throwAndLog";
import type { ILogger } from "./Membrane";
import type { ObjectGraphHandler } from "./ObjectGraphHandler";
import type { IProxyParts } from "./ProxyMapping";

export interface IProxyNotifyOptions {
  trapName?: string;
  callable?: string;
  isThis?: boolean;
  argIndex?: number;
  originHandler?: ObjectGraphHandler;
  targetHandler?: ObjectGraphHandler;
}

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
  proxy: unknown;

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
 * @param options  {any} Special options to pass on to the listeners.
 *
 * @private
 */
export function ProxyNotify(
  parts: IProxyParts,
  handler: ObjectGraphHandler,
  isOrigin: boolean,
  options?: IProxyNotifyOptions
): void {
  if (typeof options === "undefined") {
    options = {};
  }

  // private variables
  const listeners = handler.__proxyListeners__;
  if (listeners.length === 0) {
    return;
  }
  const modifyRules = handler.membrane.modifyRules;

  // the actual metadata object for the listener
  var meta = Object.create(options, {
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
    "proxy": new AccessorDescriptor(
      () => parts.proxy,
      (val) => {
        if (!meta.stopped) {
          parts.proxy = val;
        }
      }
    ),

    /* XXX ajvincent revoke is explicitly NOT exposed, lest a listener call it
     * and cause chaos for any new proxy trying to rely on the existing one.  If
     * you really have a problem, use throwException() below.
     */

    /**
     * The unwrapped object or function we're building the proxy for.
     */
    "target": new DataDescriptor(parts.value),

    "isOriginGraph": new DataDescriptor(isOrigin),

    /**
     * The proxy handler.  This should be an ObjectGraphHandler.
     */
    "handler": new AccessorDescriptor(
      () => handler,
      (val) => {
        if (!meta.stopped) {
          handler = val;
        }
      }
    ),

    /**
     * A reference to the membrane logger, if there is one.
     */
    "logger": new DataDescriptor(handler.membrane.logger),

    /**
     * Rebuild the proxy object.
     */
    "rebuildProxy": new DataDescriptor(function (this: AllListenerMetadata) {
      if (!this.stopped) {
        parts.proxy = modifyRules.replaceProxy(parts.proxy!, handler); // ansteg TODO: I added a type assertion, but this may be masking a real bug.
      }
    }),

    /**
     * Direct the membrane to use the shadow target instead of the full proxy.
     *
     * @param mode {String} One of several values:
     *   - "frozen" means return a frozen shadow target.
     *   - "sealed" means return a sealed shadow target.
     *   - "prepared" means return a shadow target with lazy getters for all
     *     available properties and for its prototype.
     */
    "useShadowTarget": new DataDescriptor((mode: UseShadowTargetMode) => {
      useShadowTarget.apply(meta, [parts, handler, mode]);
    })
  });

  const callbacks: ((proxy?: object) => void)[] = [];
  const inConstruction = handler.proxiesInConstruction;
  inConstruction.set(parts.value, callbacks);

  try {
    invokeProxyListeners(listeners, meta);
  } finally {
    callbacks.forEach((c) => {
      try {
        c(parts.proxy);
      } catch (e) {
        // do nothing
      }
    });

    inConstruction.delete(parts.value);
  }
}

function useShadowTarget(
  this: AllListenerMetadata,
  parts: IProxyParts,
  handler: ObjectGraphHandler,
  mode: UseShadowTargetMode
): void {
  let newHandler = {} as ProxyHandler<object>;

  if (mode === "frozen") {
    Object.freeze(parts.proxy);
  } else if (mode === "sealed") {
    Object.seal(parts.proxy);
  } else if (mode === "prepared") {
    // Establish the list of own properties.
    const keys = Reflect.ownKeys(parts.proxy!); // ansteg TODO: is there a bug here? parts.proxy might not be defined.
    keys.forEach(function (key) {
      handler.defineLazyGetter(parts.value, parts.shadowTarget!, key); // ansteg TODO: is there a bug here? parts.shadowTarget might not be defined.
    });

    /* Establish the prototype.  (I tried using a lazy getPrototypeOf,
     * but testing showed that fails a later test.)
     */
    let proto = handler.getPrototypeOf(parts.shadowTarget!); // ansteg TODO: is there a bug here? parts.shadowTarget might not be defined.
    Reflect.setPrototypeOf(parts.shadowTarget!, proto); // ansteg TODO: is there a bug here? parts.shadowTarget might not be defined.

    // Lazy preventExtensions.
    newHandler.preventExtensions = function (st) {
      var rv = handler.preventExtensions.apply(handler, [st]);
      delete newHandler.preventExtensions;
      return rv;
    };
  } else {
    throwAndLog(
      "useShadowTarget requires its first argument be 'frozen', 'sealed', or 'prepared'",
      "ProxyNotify:useShadowTarget",
      this.logger
    );
  }

  this.stopIteration();
  if (typeof parts.shadowTarget == "function") {
    newHandler.apply = handler.boundMethods.apply;
    newHandler.construct = handler.boundMethods.construct;
  } else if (Reflect.ownKeys(newHandler).length === 0) {
    newHandler = Reflect;
  } // yay, maximum optimization

  let newParts = Proxy.revocable(parts.shadowTarget!, newHandler); // ansteg TODO: is there a bug here? parts.shadowTarget might not be defined.
  parts.proxy = newParts.proxy;
  parts.revoke = newParts.revoke;

  const masterMap = handler.membrane.map;
  let map = masterMap.get(parts.value);
  assert(
    map instanceof ProxyMapping,
    "Didn't get a ProxyMapping for an existing value?",
    "ProxyNotify:useShadowTarget",
    this.logger
  );
  masterMap.set(parts.proxy, map);
  makeRevokeDeleteRefs(parts, map, handler.fieldName);
}

export function invokeProxyListeners(
  listeners: ((meta: AllListenerMetadata) => void)[],
  meta: ListenerMetadata
): void {
  listeners = listeners.slice(0);
  var index = 0,
    exn: unknown = null,
    exnFound = false,
    stopped = false;

  Object.defineProperties(meta, {
    /**
     * Notify no more listeners.
     */
    "stopIteration": new DataDescriptor(() => {
      stopped = true;
    }),

    "stopped": new AccessorDescriptor(() => stopped),

    /**
     * Explicitly throw an exception from the listener, through the membrane.
     */
    "throwException": new DataDescriptor(function (e: unknown) {
      stopped = true;
      exnFound = true;
      exn = e;
    })
  });

  Object.seal(meta);

  while (!stopped && index < listeners.length) {
    try {
      listeners[index]!(meta as AllListenerMetadata);
    } catch (e) {
      if (meta.logger) {
        /* We don't want an accidental exception to break the iteration.
        That's why the throwException() method exists:  a deliberate call means
        yes, we really want that exception to propagate outward... which is
        still nasty when you consider what a membrane is for.
        */
        try {
          meta.logger.error(
            typeof e === "object" && e !== null ? (e as any).message : "unknown error",
            "invokeProxyListeners",
            e
          );
        } catch (f) {
          // really do nothing, there's no point
        }
      }
    }
    if (exnFound) {
      throw exn;
    }
    index++;
  }

  stopped = true;
}

Object.freeze(ProxyNotify);
Object.freeze(useShadowTarget);

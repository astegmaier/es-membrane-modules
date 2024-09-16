import { ObjectGraphHandler } from "./ObjectGraphHandler";
import { DistortionsListener } from "./DistortionsListener";

import { getRealTarget, inGraphHandler, makeRevokeDeleteRefs } from "./utils/moduleUtilities";
import { allTraps, DataDescriptor, isDataDescriptor } from "./utils/sharedUtilities";
import { throwAndLog } from "./utils/throwAndLog";

import type { Membrane } from "./Membrane";
import type { IProxyParts, ProxyMapping } from "./ProxyMapping";
import type { Trap, DataDescriptorsOf } from "./utils/sharedUtilities";

const DogfoodMembrane = undefined as Membrane | undefined;

/**
 * @fileoverview
 *
 * The Membrane implementation represents a perfect mirroring of objects and
 * properties from one object graph to another... until the code creating the
 * membrane invokes methods of membrane.modifyRules.  Then, through either
 * methods on ProxyMapping or new proxy traps, the membrane will be able to use
 * the full power proxies expose, without carrying the operations over to the
 * object graph which owns a particular "original" value (meaning unwrapped for
 * direct access).
 *
 * For developers modifying this API to add new general-behavior rules, here are
 * the original author's recommendations:
 *
 * (1) Add your public API on ModifyRulesAPI.prototype.
 *   * When it makes sense to do so, the new methods' names and arguments should
 *     resemble methods on Object or Reflect.  (This does not mean
 *     they should have exactly the same names and arguments - only that you
 *     should consider existing standardized methods on standardized globals,
 *     and try to make new methods on ModifyRulesAPI.prototype follow roughly
 *     the same pattern in the new API.)
 * (2) When practical, especially when it affects only one object graph
 *     directly, use ProxyMapping objects to store properties which determine
 *     the rules, as opposed to new proxy traps.
 *   * Define new methods on ProxyMapping.prototype for storing or retrieving
 *     the properties.
 *   * Internally, the new methods should store properties on
 *     this.proxiedFields[fieldName].
 *   * Modify the existing ProxyHandler traps in ObjectGraphHandler.prototype
 *     to call the ProxyMapping methods, in order to implement the new behavior.
 * (3) If the new API must define a new proxy, or more than one:
 *   * Use membrane.modifyRules.createChainHandler to define the ProxyHandler.
 *   * In the ChainHandler's own-property traps, use this.nextHandler[trapName]
 *     or this.baseHandler[trapName] to forward operations to the next or
 *     original traps in the prototype chain, respectively.
 *   * Be minimalistic:  Implement only the traps you explicitly need, and only
 *     to do the specific behavior you need.  Other ProxyHandlers in the
 *     prototype chain should be trusted to handle the behaviors you don't need.
 *   * Use membrane.modifyRules.replaceProxy to apply the new ProxyHandler.
 */

export interface IChainHandlerProtection {
  /**
   * Return true if a property should not be deleted or redefined.
   */
  isProtectedName(chainHandler: IChainHandler, propName: string | symbol): boolean;

  /**
   * Thou shalt not set the prototype of a ChainHandler.
   */
  setPrototypeOf(): boolean;

  /**
   * Proxy/handler trap restricting which properties may be deleted.
   */
  deleteProperty(chainHandler: IChainHandler, propName: string | symbol): boolean;

  /**
   * Proxy/handler trap restricting which properties may be redefined.
   */
  defineProperty(
    chainHandler: IChainHandler,
    propName: string | symbol,
    desc: PropertyDescriptor
  ): boolean;
}

export interface IChainHandler extends ObjectGraphHandler {
  nextHandler: IChainHandler;
  baseHandler: ObjectGraphHandler;
  membrane: Membrane;
}

export type OwnKeysFilter =
  | ((propertyName: string | symbol) => boolean)
  | Set<symbol | string>
  | Array<symbol | string>;

export const ChainHandlers = new WeakSet();

// XXX ajvincent These rules are examples of what DogfoodMembrane should set.
export const ChainHandlerProtection: IChainHandlerProtection = Object.create(Reflect, {
  /**
   * Return true if a property should not be deleted or redefined.
   */
  "isProtectedName": new DataDescriptor(
    function (chainHandler: IChainHandler, propName: string | symbol): boolean {
      let rv: (string | symbol)[] = ["nextHandler", "baseHandler", "membrane"];
      let baseHandler = chainHandler.baseHandler;
      if ((baseHandler as any) !== Reflect) {
        rv = rv.concat(Reflect.ownKeys(baseHandler));
      }
      return rv.includes(propName);
    },
    false,
    false,
    false
  ),

  /**
   * Thou shalt not set the prototype of a ChainHandler.
   */
  "setPrototypeOf": new DataDescriptor(
    function () {
      return false;
    },
    false,
    false,
    false
  ),

  /**
   * Proxy/handler trap restricting which properties may be deleted.
   */
  "deleteProperty": new DataDescriptor(
    function (
      this: IChainHandlerProtection,
      chainHandler: IChainHandler,
      propName: string | symbol
    ): boolean {
      if (this.isProtectedName(chainHandler, propName)) {
        return false;
      }
      return Reflect.deleteProperty(chainHandler, propName);
    },
    false,
    false,
    false
  ),

  /**
   * Proxy/handler trap restricting which properties may be redefined.
   */
  "defineProperty": new DataDescriptor(
    function (
      this: IChainHandlerProtection,
      chainHandler: IChainHandler,
      propName: string | symbol,
      desc: PropertyDescriptor
    ): boolean {
      if (this.isProtectedName(chainHandler, propName)) {
        return false;
      }

      if (allTraps.includes(propName as Trap)) {
        if (!isDataDescriptor(desc) || typeof desc.value !== "function") {
          return false;
        }
        desc = new DataDescriptor(
          inGraphHandler(propName, desc.value),
          desc.writable,
          desc.enumerable,
          desc.configurable
        );
      }

      return Reflect.defineProperty(chainHandler, propName, desc);
    },
    false,
    false,
    false
  )
} satisfies DataDescriptorsOf<IChainHandlerProtection>);

export class ModifyRulesAPI {
  membrane!: Membrane;

  constructor(membrane: Membrane) {
    Object.defineProperty(this, "membrane", new DataDescriptor(membrane, false, false, false));
    Object.seal(this);
  }

  /**
   * Convert a shadow target to a real proxy target.
   * @param shadowTarget The supposed target.
   * @returns The target this shadow target maps to.
   */
  getRealTarget = getRealTarget;

  /**
   * Create a ProxyHandler inheriting from Reflect or an ObjectGraphHandler.
   * @param existingHandler The prototype of the new handler.
   */
  createChainHandler(existingHandler: ObjectGraphHandler | typeof Reflect): IChainHandler {
    // ansteg TODO: Improve signature typing - if this were handed a Reflect object, it would return a different type (I think?)

    // Yes, the logic is a little convoluted, but it seems to work this way.
    let baseHandler: typeof Reflect | ObjectGraphHandler = Reflect,
      description = "Reflect";
    if (ChainHandlers.has(existingHandler)) {
      // @ts-expect-error - if an object is a IChainHandler (with a baseHandler property), it will be in the ChainHandlers WeakMap, but typescript doesn't know about this.
      baseHandler = existingHandler.baseHandler;
    }

    if (existingHandler instanceof ObjectGraphHandler) {
      if (!this.membrane.ownsHandler(existingHandler)) {
        // XXX ajvincent Fix this error message!!
        throwAndLog(
          "fieldName must be a string or a symbol representing an ObjectGraphName in the Membrane, or null to represent Reflect",
          "ModifyRulesAPI:createChainHandler",
          this.membrane?.logger
        );
      }

      baseHandler = this.membrane.getHandlerByName(existingHandler.fieldName);
      description = "our membrane's " + baseHandler.fieldName.toString() + " ObjectGraphHandler";
    } else if (baseHandler !== Reflect) {
      // XXX ajvincent Fix this error message!!
      throwAndLog(
        "fieldName must be a string or a symbol representing an ObjectGraphName in the Membrane, or null to represent Reflect",
        "ModifyRulesAPI:createChainHandler",
        this.membrane?.logger
      );
    }

    if (baseHandler !== existingHandler && !ChainHandlers.has(existingHandler)) {
      throwAndLog(
        "Existing handler neither is " + description + " nor inherits from it",
        "ModifyRulesAPI:createChainHandler",
        this.membrane?.logger
      );
    }

    let rv: IChainHandler = Object.create(existingHandler, {
      "nextHandler": new DataDescriptor(existingHandler, false, false, false),
      "baseHandler": new DataDescriptor(baseHandler, false, false, false),
      "membrane": new DataDescriptor(this.membrane, false, false, false)
    });

    rv = new Proxy(rv, ChainHandlerProtection);
    ChainHandlers.add(rv);
    return rv;
  }

  /**
   * Replace a proxy in the membrane.
   *
   * @param oldProxy The proxy to replace.
   * @param handler  What to base the new proxy on.
   *
   * @returns The newly built proxy.
   */
  replaceProxy<T extends object>(oldProxy: T, handler: ProxyHandler<object>): T {
    if (DogfoodMembrane) {
      const [found, unwrapped] = DogfoodMembrane.getMembraneValue("internal", handler);
      if (found) {
        handler = unwrapped;
      }
    }

    // @ts-expect-error - if an object is a IChainHandler (with a baseHandler property), it will be in the ChainHandlers WeakMap, but typescript doesn't know about this.
    let baseHandler = ChainHandlers.has(handler) ? handler.baseHandler : handler;
    {
      /* These assertions are to make sure the proxy we're replacing is safe to
       * use in the membrane.
       */

      /* Ensure it has an appropriate ProxyHandler on its prototype chain.  If
       * the old proxy is actually the original value, the handler must have
       * Reflect on its prototype chain.  Otherwise, the handler must have this
       * on its prototype chain.
       *
       * Note that the handler can be Reflect or this, respectively:  that's
       * perfectly legal, as a way of restoring original behavior for the given
       * object graph.
       */

      let accepted = false;
      if (baseHandler === Reflect) {
        accepted = true;
      } else if (baseHandler instanceof ObjectGraphHandler) {
        let fieldName = baseHandler.fieldName;
        let ownedHandler = this.membrane.getHandlerByName(fieldName);
        accepted = ownedHandler === baseHandler;
      }

      if (!accepted) {
        throwAndLog(
          "handler neither inherits from Reflect or an ObjectGraphHandler in this membrane",
          "ModifyRulesAPI:replaceProxy",
          this.membrane?.logger
        );
      }
    }

    /*
     * Ensure the proxy actually belongs to the object graph the base handler
     * represents.
     */
    if (!this.membrane.map.has(oldProxy)) {
      throwAndLog(
        "This membrane does not own the proxy!",
        "ModifyRulesAPI:replaceProxy",
        this.membrane?.logger
      );
    }

    let map = this.membrane.map.get(oldProxy)!, // ansteg TODO: I added a type assertion, but this may be masking a real bug.
      cachedProxy,
      cachedField;
    if (baseHandler === Reflect) {
      cachedField = map.originField;
    } else {
      cachedField = baseHandler.fieldName;
      if (cachedField == map.originField) {
        throwAndLog(
          "You must replace original values with either Reflect or a ChainHandler inheriting from Reflect",
          "ModifyRulesAPI:replaceProxy",
          this.membrane?.logger
        );
      }
    }

    cachedProxy = map.getProxy(cachedField);
    if (cachedProxy != oldProxy) {
      throwAndLog(
        "You cannot replace the proxy with a handler from a different object graph!",
        "ModifyRulesAPI:replaceProxy",
        this.membrane?.logger
      );
    }

    // Finally, do the actual proxy replacement.
    let original = map.getOriginal(),
      shadowTarget;
    if (baseHandler === Reflect) {
      shadowTarget = original;
    } else {
      shadowTarget = map.getShadowTarget(cachedField);
    }
    let parts = Proxy.revocable(shadowTarget, handler) as IProxyParts;
    parts.value = original;
    parts.override = true;
    parts.shadowTarget = shadowTarget;
    //parts.extendedHandler = handler;
    map.set(this.membrane, cachedField, parts);
    makeRevokeDeleteRefs(parts, map, cachedField);

    let gHandler = this.membrane.getHandlerByName(cachedField);
    gHandler.addRevocable(map.originField === cachedField ? map : parts.revoke!); // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    return parts.proxy as T; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
  }

  /**
   * Ensure that the proxy passed in matches the object graph handler.
   *
   * @param fieldName  The handler's field name.
   * @param proxy      The value to look up.
   * @param methodName The calling function's name.
   */
  private assertLocalProxy(fieldName: symbol | string, proxy: unknown, methodName: string): void {
    let [found, match] = this.membrane.getMembraneProxy(fieldName, proxy);
    if (!found || proxy !== match) {
      throwAndLog(
        methodName + " requires a known proxy!",
        "ModifyRulesAPI:assertLocalProxy",
        this.membrane?.logger
      );
    }
  }

  /**
   * Require that new properties be stored via the proxies instead of propagated
   * through to the underlying object.
   *
   * @param fieldName The field name of the object graph handler the proxy uses.
   * @param proxy     The proxy (or underlying object) needing local property protection.
   */
  storeUnknownAsLocal(fieldName: symbol | string, proxy: unknown): void {
    this.assertLocalProxy(fieldName, proxy, "storeUnknownAsLocal");

    let metadata = this.membrane.map.get(proxy)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    metadata.setLocalFlag(fieldName, "storeUnknownAsLocal", true);
  }

  /**
   * Require that properties be deleted only on the proxy instead of propagated
   * through to the underlying object.
   *
   * @param fieldName The field name of the object graph handler the proxy uses.
   * @param proxy     The proxy (or underlying object) needing local property protection.
   */
  requireLocalDelete(fieldName: symbol | string, proxy: object): void {
    this.assertLocalProxy(fieldName, proxy, "requireLocalDelete");

    let metadata = this.membrane.map.get(proxy)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    metadata.setLocalFlag(fieldName, "requireLocalDelete", true);
  }

  /**
   * Apply a filter to the original list of own property names from an
   * underlying object.
   *
   * @note Local properties and local delete operations of a proxy are NOT
   * affected by the filters.
   *
   * @param fieldName The field name of the object graph handler the proxy uses.
   * @param proxy     The proxy (or underlying object) needing local property protection.
   * @param filter    The filtering function.  (May be an Array or a Set, which becomes a whitelist filter.)
   * @param _options  (optional - none defined at present)
   *
   * @see Array.prototype.filter
   */
  filterOwnKeys(
    fieldName: symbol | string,
    proxy: object,
    filter: OwnKeysFilter,
    _options = {}
  ): void {
    this.assertLocalProxy(fieldName, proxy, "filterOwnKeys");

    if (Array.isArray(filter)) {
      filter = new Set(filter);
    }

    if (filter instanceof Set) {
      const s = filter;
      filter = (key) => s.has(key);
    }

    if (typeof filter !== "function" && filter !== null) {
      throwAndLog(
        "filterOwnKeys must be a filter function, array or Set!",
        "ModifyRulesAPI:filterOwnKeys",
        this.membrane?.logger
      );
    }

    /* Defining a filter after a proxy's shadow target is not extensible
     * guarantees inconsistency.  So we must disallow that possibility.
     *
     * Note that if the proxy becomes not extensible after setting a filter,
     * that's all right.  When the proxy becomes not extensible, it then sets
     * all the proxies of the shadow target before making the shadow target not
     * extensible.
     */
    let metadata = this.membrane.map.get(proxy)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    let fieldsToCheck;
    if (metadata.originField === fieldName) {
      fieldsToCheck = Reflect.ownKeys(metadata.proxiedFields);
      fieldsToCheck.splice(fieldsToCheck.indexOf(fieldName), 1);
    } else {
      fieldsToCheck = [fieldName];
    }

    let allowed = fieldsToCheck.every(function (f) {
      let s = metadata.getShadowTarget(f);
      return Reflect.isExtensible(s);
    });

    if (allowed) {
      metadata.setOwnKeysFilter(fieldName, filter);
    } else {
      throwAndLog(
        "filterOwnKeys cannot apply to a non-extensible proxy",
        "ModifyRulesAPI:filterOwnKeys",
        this.membrane?.logger
      );
    }
  }

  /**
   * Assign the number of arguments to truncate a method's argument list to.
   *
   * @param fieldName The field name of the object graph handler the proxy uses.
   * @param proxy     The method needing argument truncation (type: proxy to a function).
   * @param value     A boolean or a number:
   *   - if true, limit to a function's arity.
   *   - if false, do not limit at all.
   *   - if a non-negative integer, limit to that number.
   */
  truncateArgList(
    fieldName: symbol | string,
    proxy: (...args: unknown[]) => unknown,
    value: boolean | number
  ): void {
    this.assertLocalProxy(fieldName, proxy, "truncateArgList");
    if (typeof proxy !== "function") {
      throwAndLog(
        "proxy must be a function!",
        "ModifyRulesAPI:truncateArgList",
        this.membrane?.logger
      );
    }
    {
      const type = typeof value;
      if (type === "number") {
        // @ts-expect-error - typescript can't follow the logic here and thinks that value might still be a boolean.
        if (!Number.isInteger(value) || value < 0) {
          throwAndLog(
            "value must be a non-negative integer or a boolean!",
            "ModifyRulesAPI:truncateArgList",
            this.membrane?.logger
          );
        }
      } else if (type !== "boolean") {
        throwAndLog(
          "value must be a non-negative integer or a boolean!",
          "ModifyRulesAPI:truncateArgList",
          this.membrane?.logger
        );
      }
    }

    let metadata = this.membrane.map.get(proxy)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    metadata.setTruncateArgList(fieldName, value);
  }

  /**
   * Disable traps for a given proxy.
   *
   * @param fieldName The name of the object graph the proxy is part of.
   * @param proxy     The proxy to affect.
   * @param trapList  A list of proxy (Reflect) traps to disable.
   */
  disableTraps(fieldName: symbol | string, proxy: object, trapList: Trap[]) {
    // ansteg TODO: should fieldName actually be constrained to a string type?
    this.assertLocalProxy(fieldName, proxy, "disableTraps");
    if (
      !Array.isArray(trapList) ||
      trapList.some((t) => {
        return typeof t !== "string";
      })
    ) {
      throwAndLog(
        "Trap list must be an array of strings!",
        "ModifyRulesAPI:disableTraps",
        this.membrane?.logger
      );
    }
    const map = this.membrane.map.get(proxy);
    trapList.forEach(function (this: ProxyMapping, t) {
      if (allTraps.includes(t)) {
        this.setLocalFlag(fieldName, `disableTrap(${t})`, true);
      }
    }, map);
  }

  createDistortionsListener(): DistortionsListener {
    return new DistortionsListener(this.membrane);
  }
}

Object.seal(ModifyRulesAPI.prototype);
Object.seal(ModifyRulesAPI);

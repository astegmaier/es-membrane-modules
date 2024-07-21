import type { DistortionsListener } from "./DistortionsListener";
import type { Membrane } from "./Membrane";

export const ChainHandlers: WeakSet<object>;

export interface IChainHandlerProtection {
  /**
   * Return true if a property should not be deleted or redefined.
   */
  isProtectedName(chainHandler: any, propName: any): boolean;
  /**
   * Thou shalt not set the prototype of a ChainHandler.
   */
  setPrototypeOf(): boolean;
  /**
   * Proxy/handler trap restricting which properties may be deleted.
   */
  deleteProperty(chainHandler: any, propName: any): boolean;
  /**
   * Proxy/handler trap restricting which properties may be redefined.
   */
  defineProperty(
    chainHandler: any,
    propName: any,
    desc: PropertyDescriptor
  ): any;
}

export const ChainHandlerProtection: IChainHandlerProtection;

export interface IChainHandler extends ProxyHandler<any> {
  nextHandler: any;
  baseHandler: any;
  membrane: Membrane;
}

export interface IModifyRulesAPIOwn {
  membrane: Membrane;
}

export interface IModifyRulesAPIPrototype {
  /**
   * Convert a shadow target to a real proxy target.
   *
   * @param {Object} shadowTarget The supposed target.
   *
   * @returns {Object} The target this shadow target maps to.
   */
  getRealTarget(this: ModifyRulesAPI, shadowTarget: object): object;

  /**
   * Create a ProxyHandler inheriting from Reflect or an ObjectGraphHandler.
   *
   * @param existingHandler {ProxyHandler} The prototype of the new handler.
   */
  createChainHandler(this: ModifyRulesAPI, existingHandler: ProxyHandler<any> | IChainHandler): IChainHandler;

  /**
   * Replace a proxy in the membrane.
   *
   * @param oldProxy {Proxy} The proxy to replace.
   * @param handler  {ProxyHandler} What to base the new proxy on.
   *
   * @returns {Proxy} The newly built proxy.
   */
  replaceProxy(this: ModifyRulesAPI, oldProxy: any, handler: ProxyHandler<any>): any;

  /**
   * Ensure that the proxy passed in matches the object graph handler.
   *
   * @param fieldName  {symbol|string} The handler's field name.
   * @param proxy      {Proxy}  The value to look up.
   * @param methodName {String} The calling function's name.
   *
   * @private
   */
  assertLocalProxy(
    this: ModifyRulesAPI, 
    fieldName: symbol | string,
    proxy: any,
    methodName: string
  ): void;

  /**
   * Require that new properties be stored via the proxies instead of propagated
   * through to the underlying object.
   *
   * @param fieldName {symbol|string} The field name of the object graph handler
   *                                  the proxy uses.
   * @param proxy     {Proxy}  The proxy (or underlying object) needing local
   *                           property protection.
   */
  storeUnknownAsLocal(this: ModifyRulesAPI, fieldName: symbol | string, proxy: any): void;

  /**
   * Require that properties be deleted only on the proxy instead of propagated
   * through to the underlying object.
   *
   * @param fieldName {symbol|string} The field name of the object graph handler
   *                                  the proxy uses.
   * @param proxy     {Proxy}  The proxy (or underlying object) needing local
   *                           property protection.
   */
  requireLocalDelete(this: ModifyRulesAPI, fieldName: symbol | string, proxy: any): any;

  /**
   * Apply a filter to the original list of own property names from an
   * underlying object.
   *
   * @note Local properties and local delete operations of a proxy are NOT
   * affected by the filters.
   *
   * @param fieldName {symbol|string} The field name of the object graph handler
   *                                  the proxy uses.
   * @param proxy     {Proxy}    The proxy (or underlying object) needing local
   *                             property protection.
   * @param filter    {Function|Set<any>|Array<any>} The filtering function.  (May be an Array or
   *                             a Set, which becomes a whitelist filter.)
   * @param options   {Object} Broken down as follows:
   * - none defined at present
   *
   * @see Array.prototype.filter.
   */
  filterOwnKeys(
    this: ModifyRulesAPI, 
    fieldName: symbol | string,
    proxy: any,
    filter: (...args: any[]) => any | Set<any> | Array<any>,
    options?: {}
  ): any;

  /**
   * Assign the number of arguments to truncate a method's argument list to.
   *
   * @param fieldName {symbol|string} The field name of the object graph handler
   *                                  the proxy uses.
   * @param proxy     {Proxy(Function)} The method needing argument truncation.
   * @param value     {Boolean|Number}
   *   - if true, limit to a function's arity.
   *   - if false, do not limit at all.
   *   - if a non-negative integer, limit to that number.
   */
  truncateArgList(
    this: ModifyRulesAPI, 
    fieldName: symbol | string,
    proxy: any,
    value: boolean | number
  ): void;

  /**
   * Disable traps for a given proxy.
   *
   * @param fieldName {String}   The name of the object graph the proxy is part
   *                             of.
   * @param proxy     {Proxy}    The proxy to affect.
   * @param trapList  {String[]} A list of proxy (Reflect) traps to disable.
   */
  disableTraps(this: ModifyRulesAPI, fieldName: string, proxy: any, trapList: string[]): void;

  createDistortionsListener(this: ModifyRulesAPI): DistortionsListener;
}

export interface ModifyRulesAPI
  extends IModifyRulesAPIOwn,
    IModifyRulesAPIPrototype {}

export class ModifyRulesAPI {
  constructor(membrane: Membrane);
}

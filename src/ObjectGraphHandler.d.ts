import type { Membrane } from "./Membrane";
import type { ProxyMapping } from "./ProxyMapping";

export interface IObjectGraphHandlerOwn {
  membrane: Membrane;
  fieldName: any;
  passThroughFilter: any;
  mayReplacePassThrough: boolean;
  boundMethods: any;
  graphNameDescriptor: any;
  proxiesInConstruction: WeakMap<any, any>;
  __revokeFunctions__: any[];
  __isDead__: boolean;
  __proxyListeners__: any[];
  __functionListeners__: any[];
}

type WithThisValueForMethods<T, ThisValue> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (this: ThisValue, ...args: A) => R
    : T[K];
};

export interface IObjectGraphHandlerPrototype
  extends WithThisValueForMethods<
    Required<ProxyHandler<any>>,
    ObjectGraphHandler
  > {
  /**
   * Define a property on a target.
   *
   * @param {Object}  target   The target object.
   * @param {String}  propName The name of the property to define.
   * @param {Object}  desc     The descriptor for the property being defined
   *                           or modified.
   * @param {Boolean} shouldBeLocal True if the property must be defined only
   *                                on the proxy (versus carried over to the
   *                                actual target).
   *
   * @note This is a ProxyHandler trap for defineProperty, modified to include
   *       the shouldBeLocal argument.
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/handler/defineProperty
   */
  defineProperty(
    shadowTarget: object,
    propName: string | symbol,
    desc: PropertyDescriptor,
    shouldBeLocal?: boolean
  ): boolean;

  /**
   * Ensure the first argument is a known shadow target.
   *
   * @param {string} trapName     The name of the trap to run.
   * @param {object} shadowTarget The supposed target.
   * @private
   */
  validateTrapAndShadowTarget(
    this: ObjectGraphHandler,
    trapName: string,
    shadowTarget: object
  ): void;

  /**
   * Get the shadow target associated with a real value.
   *
   * @private
   */
  getShadowTarget(this: ObjectGraphHandler, target): any;

  /**
   * Ensure a value has been wrapped in the membrane (and is available for distortions)
   *
   * @param target {object} The value to wrap.
   */
  ensureMapping(this: ObjectGraphHandler, target: object): void;

  /**
   * Add a listener for new proxies.
   *
   * @see ProxyNotify
   */
  addProxyListener(this: ObjectGraphHandler, listener: any): void;

  /**
   * Remove a listener for new proxies.
   *
   * @see ProxyNotify
   */
  removeProxyListener(this: ObjectGraphHandler, listener: any): void;

  /**
   * Add a listener for function entry, return and throw operations.
   *
   * @param listener {Function} The listener to add.
   *
   * @see ObjectGraphHandler.prototype.notifyFunctionListeners for what each
   * listener will get for its arguments.
   */
  addFunctionListener(this: ObjectGraphHandler, listener: any): void;

  /**
   * Add a listener for function entry, return and throw operations.
   *
   * @param listener {Function} The listener to remove.
   */
  removeFunctionListener(this: ObjectGraphHandler, listener: any): void;

  /**
   * Notify listeners we are transitioning from one object graph to another for
   * a function call.
   *
   * @param reason   {string} Either "enter", "return" or "throw".
   * @param trapName {string} Either "apply" or "construct".
   * @param target   {object} The unwrapped target we call.
   * @param rvOrExn  {any}    If reason is "enter", undefined.
   *                          If reason is "return", the return value.
   *                          If reason is "throw", the exception.
   * @param origin   {ObjectGraphHandler} The origin graph handler.
   *
   * @note
   *
   * @private
   */
  notifyFunctionListeners(
    this: ObjectGraphHandler,
    reason: string,
    trapName: string,
    target: object,
    rvOrExn: any,
    origin: ObjectGraphHandler
  ): void;

  /**
   * Handle a call to code the membrane doesn't control.
   *
   * @private
   */
  externalHandler<T extends (...args: unknown[]) => unknown>(
    this: ObjectGraphHandler,
    callback: T
  ): ReturnType<T>;

  /**
   * Set all properties on a shadow target, including prototype, and seal it.
   *
   * @private
   */
  lockShadowTarget(this: ObjectGraphHandler, shadowTarget: any): boolean;

  /**
   * Specify the list of ownKeys this proxy exposes.
   *
   * @param {object} shadowTarget The proxy target
   * @private
   *
   * @returns {(string | symbol)[]} The list of exposed keys.
   */
  setOwnKeys(this: ObjectGraphHandler, shadowTarget: any): (string | symbol)[];

  /**
   * Define a "lazy" accessor descriptor which replaces itself with a direct
   * property descriptor when needed.
   *
   * @param source       {object} The source object holding a property.
   * @param shadowTarget {object} The shadow target for a proxy.
   * @param propName     {string|symbol} The name of the property to copy.
   *
   * @returns {boolean} true if the lazy property descriptor was defined.
   *
   * @private
   */
  defineLazyGetter(
    this: ObjectGraphHandler,
    source: any,
    shadowTarget: any,
    propName: string | symbol
  ): boolean;

  /**
   * Determine if a target, or any prototype ancestor, has a local-to-the-proxy
   * flag.
   *
   * @argument target    {object} The proxy target.
   * @argument flagName  {string} The name of the flag.
   * @argument recurse {boolean} True if we should look at prototype ancestors.
   *
   * @returns {boolean} True if local properties have been requested.
   *
   * @private
   */
  getLocalFlag(
    this: ObjectGraphHandler,
    target: any,
    flagName: string,
    recurse?: boolean
  ): boolean;

  /**
   * Determine whether this proxy (or one it inherits from) requires local
   * property deletions.
   *
   * @param target {object} The proxy target.
   *
   * @returns {boolean} True if deletes should be local.
   *
   * @private
   */
  requiresDeletesBeLocal(this: ObjectGraphHandler, target: any): boolean;

  /**
   * Truncate the argument list, if necessary.
   *
   * @param target        {Function} The method about to be invoked.
   * @param argumentsList {any[]}  The list of arguments
   *
   * returns {any[]} a copy of the list of arguments, truncated.
   *
   * @private
   */
  truncateArguments(
    this: ObjectGraphHandler,
    target: any,
    argumentsList: any[]
  ): any[];

  /**
   * Add a ProxyMapping or a Proxy.revoke function to our list.
   *
   * @private
   */
  addRevocable(this: ObjectGraphHandler, revoke: ProxyMapping | (() => void)): void;

  /**
   * Remove a ProxyMapping or a Proxy.revoke function from our list.
   *
   * @private
   */
  removeRevocable(this: ObjectGraphHandler, revoke: () => void): void;

  /**
   * Revoke the entire object graph.
   */
  revokeEverything(this: ObjectGraphHandler): void;
}

export interface ObjectGraphHandler
  extends IObjectGraphHandlerOwn,
    IObjectGraphHandlerPrototype {}

export class ObjectGraphHandler {
  constructor(membrane: Membrane, fieldName: string | symbol)
}


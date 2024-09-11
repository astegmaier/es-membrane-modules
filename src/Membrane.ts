import assert from "./assert";
import {
  returnFalse,
  DataDescriptor,
  NWNCDataDescriptor,
  isDataDescriptor,
  allTraps,
  Primordials
} from "./sharedUtilities.js";
import { IProxyNotifyOptions, ProxyNotify } from "./ProxyNotify.js";
import { ProxyMapping } from "./ProxyMapping.js";
import { ObjectGraphHandler } from "./ObjectGraphHandler.js";
import {
  valueType,
  makeShadowTarget,
  NOT_YET_DETERMINED,
  makeRevokeDeleteRefs,
  MembraneMayLog,
  Constants
} from "./moduleUtilities.js";
import { ChainHandlers, ModifyRulesAPI } from "./ModifyRulesAPI.js";
import { throwAndLog } from "./throwAndLog";
import type { FunctionListener } from "./ObjectGraphHandler";
import type { IProxyParts } from "./ProxyMapping.js";

export type LogLevel = "FATAL" | "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";

export interface ILogger {
  fatal(message: string, codeLocation?: string, error?: unknown): void;
  error(message: string, codeLocation?: string, error?: unknown): void;
  warn(message: string, codeLocation?: string): void;
  info(message: string, codeLocation?: string): void;
  debug(message: string, codeLocation?: string): void;
  trace(message: string, codeLocation?: string): void;
  log(level: LogLevel, message: string, codeLocation?: string, error?: unknown): void;
}

export interface MembraneOptions {
  passThroughFilter?: (value: unknown) => boolean;
  showGraphName?: boolean;
  logger?: ILogger | null;
}

export interface IBuildMappingOptions {
  /** A mapping with associated values and proxies. */
  mapping?: ProxyMapping;
  originHandler?: any;
  override?: boolean;
  trapName?: string;
  callable?: string;
  isThis?: boolean;
  argIndex?: number;
}

export interface IGetHandlerByNameOptions {
  /** True if we must create a missing graph handler. */
  mustCreate?: boolean;
}

/* Reference:  http://soft.vub.ac.be/~tvcutsem/invokedynamic/js-membranes
 * Definitions:
 * Object graph: A collection of values that talk to each other directly.
 */

export class Membrane {
  static readonly Primordials: typeof Primordials;

  showGraphName!: boolean;

  /*
   * key: ProxyMapping instance
   * key may be a Proxy, a value associated with a proxy, or an original value.
   */
  map!: WeakMap<any, ProxyMapping>;

  handlersByFieldName!: { [fieldName: string | symbol]: any };

  logger!: ILogger | null;

  __functionListeners__!: FunctionListener[];

  warnOnceSet!: Set<any> | null;

  modifyRules!: ModifyRulesAPI;

  passThroughFilter: (value: unknown) => boolean = () => false;

  allTraps = allTraps;

  constructor(options: MembraneOptions = {}) {
    let passThrough =
      typeof options.passThroughFilter === "function" ? options.passThroughFilter : returnFalse;

    Object.defineProperties(this, {
      "showGraphName": new NWNCDataDescriptor(Boolean(options.showGraphName), false),
      "map": new NWNCDataDescriptor(new WeakMap(), false),
      "handlersByFieldName": new NWNCDataDescriptor({}, false),
      "logger": new NWNCDataDescriptor(options.logger || null, false),
      "__functionListeners__": new NWNCDataDescriptor([], false),
      "warnOnceSet": new NWNCDataDescriptor(options.logger ? new Set() : null, false),
      "modifyRules": new NWNCDataDescriptor(new ModifyRulesAPI(this)),
      "passThroughFilter": new NWNCDataDescriptor(passThrough, false)
    });

    /* 
      XXX ajvincent Somehow adding this line breaks not only npm test, but the
      ability to build as well.  The breakage comes in trying to create a mock of
      a dogfood membrane.

      Object.seal(this);
     */
  }

  /**
   * Returns true if we have a proxy for the value.
   */
  hasProxyForValue(field: symbol | string, value: any): boolean {
    const mapping = this.map.get(value);
    return Boolean(mapping) && mapping!.hasField(field);
  }

  /**
   * Get the value associated with a field name and another known value.
   *
   * @param field {symbol|string}  The field to look for.
   * @param value {any} The key for the ProxyMapping map.
   *
   * @returns [
   *    {boolean} True if the value was found.
   *    {any} The value for that field.
   * ]
   *
   * @note This method is not used internally in the membrane, but only by debug
   * code to assert that we have the right values stored.  Therefore you really
   * shouldn't use it in Production.
   */
  getMembraneValue(field: symbol | string, value: any): [found: boolean, value: any] {
    const mapping = this.map.get(value);
    if (mapping && mapping.hasField(field)) {
      return [true, mapping.getValue(field)];
    }
    return [false, NOT_YET_DETERMINED];
  }

  /**
   * Get the proxy associated with a field name and another known value.
   *
   * @param field {symbol|string}  The field to look for.
   * @param value {any} The key for the ProxyMapping map.
   *
   * @returns {[found: boolean, value: any]} -
   * [
   *    {boolean} True if the value was found.
   *    {proxy}   The proxy for that field.
   * ] if field is not the value's origin field
   *
   * [
   *    {boolean} True if the value was found.
   *    {any} The actual value
   * ] if field is the value's origin field
   *
   * [
   *    {boolean} False if the value was not found.
   *    {object}  NOT_YET_DETERMINED
   * ]
   */
  getMembraneProxy(field: symbol | string, value: any): [found: boolean, value: any] {
    var mapping = this.map.get(value);
    if (mapping && mapping.hasField(field)) {
      return [true, mapping.getProxy(field)];
    }
    return [false, NOT_YET_DETERMINED];
  }

  /**
   * Assign a value to an object graph.
   *
   * @param handler {ObjectGraphHandler} A graph handler to bind to the value.
   * @param value   {any} The value to assign.
   * @param options {IBuildMappingOptions}
   *    mapping - A mapping with associated values and proxies.
   *    originHandler -
   *
   * @returns {ProxyMapping} A mapping holding the value.
   *
   * @private
   */
  buildMapping(
    handler: ObjectGraphHandler,
    value: any,
    options: IBuildMappingOptions = {}
  ): ProxyMapping {
    if (!this.ownsHandler(handler)) {
      throwAndLog(
        "handler is not an ObjectGraphHandler we own!",
        "Membrane:buildMapping",
        this.logger
      );
    }
    let mapping = "mapping" in options ? options.mapping : null;

    if (!mapping) {
      if (this.map.has(value)) {
        mapping = this.map.get(value)!;
      } else {
        mapping = new ProxyMapping(handler.fieldName, this.logger);
      }
    }
    assert(
      mapping instanceof ProxyMapping,
      "buildMapping requires a ProxyMapping object!",
      "Membrane:buildMapping",
      this.logger
    );

    const isOriginal = mapping.originField === handler.fieldName;
    assert(
      isOriginal || this.ownsHandler(options.originHandler),
      "Proxy requests must pass in an origin handler",
      "Membrane:buildMapping",
      this.logger
    );
    let shadowTarget = makeShadowTarget(value, "Membrane:buildMapping", this.logger);

    let parts: IProxyParts;
    if (isOriginal) {
      parts = { value: value };
      if (!Reflect.isExtensible(value)) {
        const keys = Reflect.ownKeys(value);
        keys.forEach(function (key) {
          const desc = Reflect.getOwnPropertyDescriptor(value, key)!;
          Reflect.defineProperty(shadowTarget, key, desc);
        });
        Reflect.preventExtensions(shadowTarget);
      }
    } else {
      parts = Proxy.revocable(shadowTarget, handler) as IProxyParts;
      parts.value = value;
    }

    parts.shadowTarget = shadowTarget;
    mapping.set(this, handler.fieldName, /** @type {IProxyParts} */ parts);
    makeRevokeDeleteRefs(parts, mapping, handler.fieldName);

    if (!isOriginal) {
      const notifyOptions: IProxyNotifyOptions = {
        isThis: false,
        originHandler: options.originHandler,
        targetHandler: handler
      };

      (["trapName", "callable", "isThis", "argIndex"] as const).forEach(
        <T extends keyof IBuildMappingOptions>(propName: T) => {
          if (Reflect.has(options, propName)) {
            (notifyOptions as IBuildMappingOptions)[propName] = options[propName];
          }
        }
      );

      ProxyNotify(parts, options.originHandler, true, notifyOptions);
      ProxyNotify(parts, handler, false, notifyOptions);

      if (!Reflect.isExtensible(value)) {
        try {
          Reflect.preventExtensions(parts.proxy!); // ansteg TODO: I added a type assertion, but this may be masking a real bug.
        } catch (e) {
          // do nothing
        }
      }
    }

    handler.addRevocable(isOriginal ? mapping : parts.revoke!); // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    return mapping;
  }

  hasHandlerByField(field: symbol | string): boolean {
    {
      let t = typeof field;
      if (t != "string" && t != "symbol") {
        throwAndLog(
          "field must be a string or a symbol!",
          "Membrane:hasHandlerByField",
          this.logger
        );
      }
    }
    return Reflect.ownKeys(this.handlersByFieldName).includes(field);
  }

  /**
   * Get an ObjectGraphHandler object by field name.  Build it if necessary.
   *
   * @param field      {symbol|string}  The field name for the object graph.
   * @param options    {IGetHandlerByNameOptions} Broken down as follows:
   * - mustCreate {Boolean} True if we must create a missing graph handler.
   *
   * @returns {ObjectGraphHandler} The handler for the object graph.
   */
  getHandlerByName(field: symbol | string, options?: IGetHandlerByNameOptions): ObjectGraphHandler {
    if (typeof options === "boolean") {
      throwAndLog("fix me!", "Membrane:getHandlerByName", this.logger);
    }
    let mustCreate = typeof options == "object" ? Boolean(options.mustCreate) : false;
    if (mustCreate && !this.hasHandlerByField(field)) {
      this.handlersByFieldName[field] = new ObjectGraphHandler(this, field);
    }
    return this.handlersByFieldName[field];
  }

  /**
   * Determine if the handler is a ObjectGraphHandler for this object graph.
   *
   * @returns True if the handler is one we own.
   */
  ownsHandler(handler: ObjectGraphHandler): boolean {
    if (ChainHandlers.has(handler)) {
      // @ts-expect-error - if an object is a IChainHandler (with a baseHandler property), it will be in the ChainHandlers WeakMap, but typescript doesn't know about this.
      handler = handler.baseHandler;
    }
    return (
      handler instanceof ObjectGraphHandler &&
      this.handlersByFieldName[handler.fieldName] === handler
    );
  }

  /**
   * Wrap a value for the first time in an object graph.
   *
   * @param mapping {ProxyMapping}  A mapping whose origin field refers to the value's object graph.
   * @param arg     {any}           The value to wrap.
   * @param options {IBuildMappingOptions}
   *
   * @note This marks the value as the "original" in the new ProxyMapping it creates.
   */
  wrapArgumentByProxyMapping(
    mapping: ProxyMapping,
    arg: any,
    options: IBuildMappingOptions = {}
  ): any {
    if (this.map.has(arg) || valueType(arg) === "primitive") {
      return;
    }

    let handler = this.getHandlerByName(mapping.originField);
    this.buildMapping(handler, arg, options);

    assert(
      this.map.has(arg),
      "wrapArgumentByProxyMapping should define a ProxyMapping for arg",
      "Membrane:wrapArgumentByProxyMapping",
      this.logger
    );
    let argMap = this.map.get(arg);
    assert(
      argMap instanceof ProxyMapping,
      "argMap isn't a ProxyMapping?",
      "Membrane:wrapArgumentByProxyMapping",
      this.logger
    );
    assert(
      argMap.getOriginal() === arg,
      "wrapArgumentByProxyMapping didn't establish the original?",
      "Membrane:wrapArgumentByProxyMapping",
      this.logger
    );
  }

  /**
   * Ensure an argument is properly wrapped in a proxy.
   *
   * @param origin  {ObjectGraphHandler} Where the argument originated from
   * @param target  {ObjectGraphHandler} The object graph we're returning the arg to.
   * @param arg     {any} The argument.
   * @param options {IBuildMappingOptions}
   *
   * @returns {any}
   *    - The proxy for that field - if field is not the value's origin field.
   *    - The actual value - if field is the value's origin field.
   *
   * @throws {Error} if failed (this really should never happen)
   */
  convertArgumentToProxy(
    originHandler: ObjectGraphHandler,
    targetHandler: ObjectGraphHandler,
    arg: any,
    options: IBuildMappingOptions = {}
  ): any {
    var override = "override" in options && options.override === true;
    if (override) {
      let map = this.map.get(arg);
      if (map) {
        map.selfDestruct(this);
      }
    }

    if (valueType(arg) === "primitive") {
      return arg;
    }

    let found, rv;
    [found, rv] = this.getMembraneProxy(targetHandler.fieldName, arg);
    if (found) {
      return rv;
    }

    if (
      !this.ownsHandler(originHandler) ||
      !this.ownsHandler(targetHandler) ||
      originHandler.fieldName === targetHandler.fieldName
    ) {
      throwAndLog(
        "convertArgumentToProxy requires two different ObjectGraphHandlers in the Membrane instance",
        "Membrane:convertArgumentToProxy",
        this.logger
      );
    }

    if (
      this.passThroughFilter(arg) ||
      (originHandler.passThroughFilter(arg) && targetHandler.passThroughFilter(arg))
    ) {
      return arg;
    }

    if (!this.hasProxyForValue(originHandler.fieldName, arg)) {
      let argMap = this.map.get(arg);
      let passOptions;
      if (argMap) {
        passOptions = Object.create(options, {
          "mapping": new DataDescriptor(argMap)
        });
      } else {
        passOptions = options;
      }

      this.buildMapping(originHandler, arg, passOptions);
    }

    if (!this.hasProxyForValue(targetHandler.fieldName, arg)) {
      let argMap = this.map.get(arg);
      let passOptions = Object.create(options, {
        "originHandler": new DataDescriptor(originHandler)
      });
      assert(
        argMap,
        "ProxyMapping not created before invoking target handler?",
        "Membrane:convertArgumentToProxy",
        this.logger
      );

      Reflect.defineProperty(passOptions, "mapping", new DataDescriptor(argMap));

      this.buildMapping(targetHandler, arg, passOptions);
    }

    [found, rv] = this.getMembraneProxy(targetHandler.fieldName, arg);
    if (!found) {
      throwAndLog(
        "in convertArgumentToProxy(): proxy not found",
        "Membrane:convertArgumentToProxy",
        this.logger
      );
    }
    return rv;
  }

  /**
   * Link two values together across object graphs.
   *
   * @param handler0 {ObjectGraphHandler} The graph handler that should own value0.
   * @param value0   {Object}             The first value to store.
   * @param handler1 {ObjectGraphHandler} The graph handler that should own value1.
   * @param value1   {any}                The second value to store.
   */
  bindValuesByHandlers(
    handler0: ObjectGraphHandler,
    value0: any,
    handler1: ObjectGraphHandler,
    value1: any
  ): void {
    interface IBag {
      handler: ObjectGraphHandler;
      value: ObjectGraphHandler;
      type: "function" | "object" | "primitive";
      proxyMap?: ProxyMapping | undefined;
      maySet?: boolean;
    }

    /** XXX ajvincent The logic here is convoluted, I admit.  Basically, if we
     * succeed:
     * handler0 must own value0
     * handler1 must own value1
     * the ProxyMapping instances for value0 and value1 must be the same
     * there must be no collisions between any properties of the ProxyMapping
     *
     * If we fail, there must be no side-effects.
     */
    function bag(this: Membrane, h: ObjectGraphHandler, v: ObjectGraphHandler): IBag {
      if (!this.ownsHandler(h)) {
        throwAndLog(
          "bindValuesByHandlers requires two ObjectGraphHandlers from different graphs",
          "Membrane:bindValuesByHandlers",
          this.logger
        );
      }
      let rv: IBag = {
        handler: h,
        value: v,
        type: valueType(v)
      };
      if (rv.type !== "primitive") {
        rv.proxyMap = this.map.get(v);
        const field = rv.handler.fieldName;
        const valid =
          !rv.proxyMap || (rv.proxyMap.hasField(field) && rv.proxyMap.getProxy(field) === v);
        if (!valid) {
          throwAndLog(
            "Value argument does not belong to proposed ObjectGraphHandler",
            "Membrane:bindValuesByHandlers:bag",
            this.logger
          );
        }
      }

      return rv;
    }

    function checkField(bag: IBag, logger: ILogger | null) {
      if (proxyMap.hasField(bag.handler.fieldName)) {
        let check = proxyMap.getProxy(bag.handler.fieldName);
        if (check !== bag.value) {
          throwAndLog(
            "Value argument does not belong to proposed object graph",
            "Membrane:bindValuesByHandlers:checkField",
            logger
          );
        }
        bag.maySet = false;
      } else {
        bag.maySet = true;
      }
    }

    function applyBag(this: Membrane, bag: IBag) {
      if (!bag.maySet) {
        return;
      }
      let parts = { proxy: bag.value } as IProxyParts;
      if (proxyMap.originField === bag.handler.fieldName) {
        parts.value = bag.value;
      } else {
        parts.value = proxyMap.getOriginal();
      }
      proxyMap.set(this, bag.handler.fieldName, parts);
    }

    var propBag0 = bag.apply(this, [handler0, value0]);
    var propBag1 = bag.apply(this, [handler1, value1]);
    var proxyMap = propBag0.proxyMap!;

    if (propBag0.type === "primitive") {
      if (propBag1.type === "primitive") {
        throwAndLog(
          "bindValuesByHandlers requires two non-primitive values",
          "Membrane:bindValuesByHandlers",
          this.logger
        );
      }

      proxyMap = propBag1.proxyMap!;

      let temp = propBag0;
      propBag0 = propBag1;
      propBag1 = temp;
    }

    if (propBag0.proxyMap && propBag1.proxyMap) {
      if (propBag0.proxyMap !== propBag1.proxyMap) {
        // See https://github.com/ajvincent/es-membrane/issues/77 .
        throwAndLog(
          "Linking two ObjectGraphHandlers in this way is not safe.",
          "Membrane:bindValuesByHandlers",
          this.logger
        );
      }
    } else if (!propBag0.proxyMap) {
      if (!propBag1.proxyMap) {
        proxyMap = new ProxyMapping(propBag0.handler.fieldName, this.logger);
      } else {
        proxyMap = propBag1.proxyMap;
      }
    }

    checkField(propBag0, this.logger);
    checkField(propBag1, this.logger);

    if (propBag0.handler.fieldName === propBag1.handler.fieldName) {
      if (propBag0.value !== propBag1.value) {
        throwAndLog(
          "bindValuesByHandlers requires two ObjectGraphHandlers from different graphs",
          "Membrane:bindValuesByHandlers",
          this.logger
        );
      }
      // no-op
      propBag0.maySet = false;
      propBag1.maySet = false;
    }

    applyBag.apply(this, [propBag0]);
    applyBag.apply(this, [propBag1]);

    // Postconditions
    if (propBag0.type !== "primitive") {
      let [found, check] = this.getMembraneProxy(propBag0.handler.fieldName, propBag0.value);
      assert(found, "value0 mapping not found?", "Membrane:bindValuesByHandlers", this.logger);
      assert(
        check === propBag0.value,
        "value0 not found in handler0 field name?",
        "Membrane:bindValuesByHandlers",
        this.logger
      );

      [found, check] = this.getMembraneProxy(propBag1.handler.fieldName, propBag0.value);
      assert(found, "value0 mapping not found?", "Membrane:bindValuesByHandlers", this.logger);
      assert(
        check === propBag1.value,
        "value0 not found in handler0 field name?",
        "Membrane:bindValuesByHandlers",
        this.logger
      );
    }

    if (propBag1.type !== "primitive") {
      let [found, check] = this.getMembraneProxy(propBag0.handler.fieldName, propBag1.value);
      assert(found, "value1 mapping not found?", "Membrane:bindValuesByHandlers", this.logger);
      assert(
        check === propBag0.value,
        "value0 not found in handler0 field name?",
        "Membrane:bindValuesByHandlers",
        this.logger
      );

      [found, check] = this.getMembraneProxy(propBag1.handler.fieldName, propBag1.value);
      assert(found, "value1 mapping not found?", "Membrane:bindValuesByHandlers", this.logger);
      assert(
        check === propBag1.value,
        "value1 not found in handler1 field name?",
        "Membrane:bindValuesByHandlers",
        this.logger
      );
    }
  }

  /**
   * Wrap the methods of a descriptor in an object graph.
   *
   * @private This method should NOT be exposed to the public.
   */
  wrapDescriptor(
    originField: symbol | string,
    targetField: symbol | string,
    desc: PropertyDescriptor
  ): PropertyDescriptor {
    if (!desc) {
      return desc;
    }

    // XXX ajvincent This optimization may need to go away for wrapping primitives.
    if (isDataDescriptor(desc) && valueType(desc.value) === "primitive") {
      return desc;
    }

    var keys = Object.keys(desc);

    var wrappedDesc: PropertyDescriptor = {
      configurable: Boolean(desc.configurable)
    };
    if ("enumerable" in desc) {
      wrappedDesc.enumerable = Boolean(desc.enumerable);
    }
    if (keys.includes("writable")) {
      wrappedDesc.writable = Boolean(desc.writable);
      if (!wrappedDesc.configurable && !wrappedDesc.writable) {
        return desc;
      }
    }

    var originHandler = this.getHandlerByName(originField);
    var targetHandler = this.getHandlerByName(targetField);

    (["value", "get", "set"] as const).forEach((descProp) => {
      if (keys.includes(descProp)) {
        wrappedDesc[descProp] = this.convertArgumentToProxy(
          originHandler,
          targetHandler,
          desc[descProp]
        );
      }
    });

    return wrappedDesc;
  }

  /* Disabled, dead API.
  calledFromHandlerTrap() {
    return this.handlerStack[1] !== "external";
  }
  */

  /**
   * Add a listener for function entry, return and throw operations.
   *
   * @param listener {FunctionListener} The listener to add.
   *
   * @see ObjectGraphHandler.prototype.notifyFunctionListeners for what each listener will get for its arguments.
   */
  addFunctionListener(listener: FunctionListener): void {
    if (typeof listener != "function") {
      throwAndLog("listener is not a function!", "Membrane:addFunctionListener", this.logger);
    }
    if (!this.__functionListeners__.includes(listener)) {
      this.__functionListeners__.push(listener);
    }
  }

  /**
   * Add a listener for function entry, return and throw operations.
   *
   * @param listener {FunctionListener} The listener to remove.
   */
  removeFunctionListener(listener: FunctionListener): void {
    let index = this.__functionListeners__.indexOf(listener);
    if (index == -1) {
      throwAndLog("listener is not registered!", "Membrane:removeFunctionListener", this.logger);
    }
    this.__functionListeners__.splice(index, 1);
  }

  /**
   * A flag indicating if internal properties of the Membrane are private.
   *
   * @public
   */
  secured = false;

  readonly __mayLog__: () => boolean = MembraneMayLog;

  warnOnce(message: string, codeLocation: string): void {
    if (this.logger && !this.warnOnceSet!.has(message)) {
      this.warnOnceSet!.add(message);
      this.logger.warn(message, codeLocation);
    }
  }

  get constants() {
    return Constants;
  }
}

Reflect.defineProperty(
  Membrane,
  "Primordials",
  new NWNCDataDescriptor(Primordials, true) // this should be visible
);

Object.seal(Membrane.prototype);
Object.seal(Membrane);

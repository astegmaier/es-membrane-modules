import { assert } from "./utils/assert";
import {
  returnFalse,
  DataDescriptor,
  NWNCDataDescriptor,
  isDataDescriptor,
  isAccessorDescriptor
} from "./utils/sharedUtilities";
import { ProxyMapping } from "./ProxyMapping";
import { valueType, getRealTarget, AssertIsPropertyKey } from "./utils/moduleUtilities";
import { throwAndLog } from "./utils/throwAndLog";
import type { ILogger, Membrane } from "./Membrane";
import type { AllListenerMetadata } from "./ProxyNotify";

export type FunctionListener = (
  reason: "enter" | "return" | "throw",
  trapName: "apply" | "construct",
  fromField: symbol | string,
  toField: symbol | string,
  target: object,
  rvOrExn: any
) => void;

export type ProxyListener = (meta: AllListenerMetadata) => void;

export type BoundMethods = {
  apply: ObjectGraphHandler["apply"];
  construct: ObjectGraphHandler["construct"];
};

/* A proxy handler designed to return only primitives and objects in a given
 * object graph, defined by the fieldName.
 */
export class ObjectGraphHandler implements ProxyHandler<object> {
  readonly membrane: Membrane;

  readonly fieldName: symbol | string;

  readonly boundMethods: BoundMethods;

  private readonly loggerWeakRef: WeakRef<ILogger> | undefined;

  /* Temporary until membraneGraphName is defined on Object.prototype through the object graph. */
  private readonly graphNameDescriptor: DataDescriptor<symbol | string>;

  /*
   * original value: [callback() {}, ...]
   * see .defineLazyGetter, ProxyNotify for details.
   */
  readonly proxiesInConstruction = new WeakMap<any, any>();

  private __revokeFunctions__: any[] = [];

  private __isDead__: boolean = false;

  readonly __proxyListeners__: ProxyListener[] = [];

  readonly __functionListeners__: FunctionListener[] = [];

  constructor(membrane: Membrane, fieldName: symbol | string) {
    {
      let t = typeof fieldName;
      if (t != "string" && t != "symbol") {
        throwAndLog(
          "field must be a string or a symbol!",
          "ObjectGraphHandler:constructor",
          membrane?.logger
        );
      }
    }

    let boundMethods = {} as BoundMethods;
    (["apply", "construct"] as const).forEach(function (this: ObjectGraphHandler, key) {
      Reflect.defineProperty(
        boundMethods,
        key,
        new NWNCDataDescriptor(this[key].bind(this), false)
      );
    }, this);
    Object.freeze(boundMethods);
    this.boundMethods = boundMethods;

    // ansteg: to avoid leaking the logger, we are being defensive about introducing new hard references to the logger or the membrane.
    this.loggerWeakRef = membrane.logger ? new WeakRef(membrane.logger) : undefined;

    this.membrane = membrane;
    this.fieldName = fieldName;
    this.graphNameDescriptor = new DataDescriptor(fieldName);

    Object.defineProperty(this, "membrane", {
      enumerable: false,
      writable: false,
      configurable: false
    });
    Object.defineProperty(this, "fieldName", {
      enumerable: false,
      writable: false,
      configurable: false
    });
    Object.defineProperty(this, "graphNameDescriptor", { enumerable: false, configurable: false });
  }

  private _passThroughFilter: (value: unknown) => boolean = returnFalse;

  get passThroughFilter(): (value: unknown) => boolean {
    return this._passThroughFilter;
  }
  set passThroughFilter(val: (value: unknown) => boolean) {
    if (this._passThroughFilter !== returnFalse) {
      throwAndLog(
        "passThroughFilter has been defined once already!",
        "ObjectGraphHandler:passThroughFilter:set",
        this.loggerWeakRef?.deref()
      );
    }
    if (typeof val !== "function") {
      throwAndLog(
        "passThroughFilter must be a function",
        "ObjectGraphHandler:passThroughFilter:set",
        this.loggerWeakRef?.deref()
      );
    }
    this._passThroughFilter = val;
  }
  get mayReplacePassThrough(): boolean {
    return this._passThroughFilter === returnFalse;
  }

  /* Strategy for each handler trap:
   * (1) Determine the target's origin field name.
   * (2) Wrap all non-primitive arguments for Reflect in the target field.
   * (3) var rv = Reflect[trapName].call(argList);
   * (4) Wrap rv in this.fieldName's field.
   * (5) return rv.
   *
   * Error stack trace hiding will be determined by the membrane itself.
   */

  /**
   * A trap for `Reflect.ownKeys()`.
   * @param shadowTarget The original object which is being proxied.
   */
  ownKeys(shadowTarget: object): ArrayLike<string | symbol> {
    this.validateTrapAndShadowTarget("ownKeys", shadowTarget);
    if (!Reflect.isExtensible(shadowTarget)) {
      return Reflect.ownKeys(shadowTarget);
    }

    var target = getRealTarget(shadowTarget);
    var targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.

    // cached keys are only valid if original keys have not changed
    var cached = targetMap.cachedOwnKeys(this.fieldName);
    if (cached) {
      let _this = targetMap.getOriginal();
      let check = this.externalHandler(function () {
        return Reflect.ownKeys(_this);
      });

      let pass =
        check.length == cached.original.length &&
        check.every(function (elem) {
          return cached.original.includes(elem);
        });
      if (pass) {
        return cached.keys.slice(0);
      }
    }
    return this.setOwnKeys(shadowTarget);
  }

  /**
   * A trap for the `in` operator.
   * @param shadowTarget The original object which is being proxied.
   * @param propName The name or `Symbol` of the property to check for existence.
   */
  has(shadowTarget: object, propName: symbol | string): boolean {
    this.validateTrapAndShadowTarget("has", shadowTarget);

    var target = getRealTarget(shadowTarget);
    /*
      http://www.ecma-international.org/ecma-262/7.0/#sec-ordinary-object-internal-methods-and-internal-slots-hasproperty-p

      1. Assert: IsPropertyKey(P) is true.
      2. Let hasOwn be ? O.[[GetOwnProperty]](P).
      3. If hasOwn is not undefined, return true.
      4. Let parent be ? O.[[GetPrototypeOf]]().
      5. If parent is not null, then
          a. Return ? parent.[[HasProperty]](P).
      6. Return false. 
    */

    // 1. Assert: IsPropertyKey(P) is true.
    AssertIsPropertyKey(propName, "ObjectGraphHandler:has", this.membrane?.logger);

    var hasOwn;
    while (target !== null) {
      let pMapping = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
      let shadow = pMapping.getShadowTarget(this.fieldName);
      hasOwn = this.getOwnPropertyDescriptor(shadow, propName);
      if (typeof hasOwn !== "undefined") {
        return true;
      }
      target = this.getPrototypeOf(shadow)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
      if (target === null) {
        break;
      }
      let foundProto;
      [foundProto, target] = this.membrane.getMembraneValue(this.fieldName, target);
      assert(
        foundProto,
        "Must find membrane value for prototype",
        "ObjectGraphHandler:has",
        this.membrane?.logger
      );
    }
    return false;
  }

  /**
   * A trap for getting a property value.
   * @param shadowTarget The original object which is being proxied.
   * @param propName The name or `Symbol` of the property to get.
   * @param receiver The proxy or an object that inherits from the proxy.
   */
  get(shadowTarget: object, propName: symbol | string, receiver: object): any {
    this.validateTrapAndShadowTarget("get", shadowTarget);

    var desc,
      target,
      found,
      rv,
      protoLookups = 0;
    target = getRealTarget(shadowTarget);

    /*
      http://www.ecma-international.org/ecma-262/7.0/#sec-ordinary-object-internal-methods-and-internal-slots-get-p-receiver

      1. Assert: IsPropertyKey(P) is true.
      2. Let desc be ? O.[[GetOwnProperty]](P).
      3. If desc is undefined, then
          a. Let parent be ? O.[[GetPrototypeOf]]().
          b. If parent is null, return undefined.
          c. Return ? parent.[[Get]](P, Receiver).
      4. If IsDataDescriptor(desc) is true, return desc.[[Value]].
      5. Assert: IsAccessorDescriptor(desc) is true.
      6. Let getter be desc.[[Get]].
      7. If getter is undefined, return undefined.
      8. Return ? Call(getter, Receiver). 
     */

    // 1. Assert: IsPropertyKey(P) is true.
    // Optimization:  do this once!
    AssertIsPropertyKey(propName, "ObjectGraphHandler:get", this.membrane?.logger);

    /* Optimization:  Recursively calling this.get() is a pain in the neck,
     * especially for the stack trace.  So let's use a do...while loop to reset
     * only the entry arguments we need (specifically, target).
     * We should exit the loop with desc, or return from the function.
     */
    do {
      let targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
      {
        /* Special case:  Look for a local property descriptors first, and if we
         * find it, return it unwrapped.
         */
        desc = targetMap.getLocalDescriptor(this.fieldName, propName);

        if (desc) {
          // Quickly repeating steps 4-8 from above algorithm.
          if (isDataDescriptor(desc)) {
            return desc.value;
          }
          if (!isAccessorDescriptor(desc)) {
            throwAndLog(
              "desc must be a data descriptor or an accessor descriptor!",
              "ObjectGraphHandler:get",
              this.membrane?.logger
            );
          }
          let type = typeof desc.get;
          if (type === "undefined") {
            return undefined;
          }
          if (type !== "function") {
            throwAndLog(
              "getter is not a function",
              "ObjectGraphHandler:get",
              this.membrane?.logger
            );
          }
          return Reflect.apply(desc.get, receiver, []);
        }
      }

      /*
        2. Let desc be ? O.[[GetOwnProperty]](P).
        3. If desc is undefined, then
            a. Let parent be ? O.[[GetPrototypeOf]]().
            b. If parent is null, return undefined.
            c. Return ? parent.[[Get]](P, Receiver).
       */
      let shadow = targetMap.getShadowTarget(this.fieldName);
      desc = this.getOwnPropertyDescriptor(shadow, propName);
      if (!desc) {
        // this is just for debugging purposes and has no real meaning.
        protoLookups++;

        let proto = this.getPrototypeOf(shadow);
        if (proto === null) {
          return undefined;
        }

        {
          let foundProto, other;
          [foundProto, other] = this.membrane.getMembraneProxy(this.fieldName, proto);
          if (!foundProto) {
            return Reflect.get(proto, propName, receiver);
          }
          assert(
            other === proto,
            "Retrieved prototypes must match",
            "ObjectGraphHandler:get",
            this.membrane?.logger
          );
        }

        if (Reflect.isExtensible(shadow)) {
          const result = this.membrane.getMembraneValue(this.fieldName, proto);
          target = result[1];
        } else {
          target = proto;
        }
      }
    } while (!desc);

    found = false;
    rv = undefined;

    // 4. If IsDataDescriptor(desc) is true, return desc.[[Value]].
    if (isDataDescriptor(desc)) {
      rv = desc.value;
      found = true;
      if (!desc.configurable && !desc.writable) {
        return rv;
      }
    }

    if (!found) {
      // 5. Assert: IsAccessorDescriptor(desc) is true.

      if (!isAccessorDescriptor(desc)) {
        throwAndLog(
          "desc must be a data descriptor or an accessor descriptor!",
          "ObjectGraphHandler:get",
          this.membrane?.logger
        );
      }

      // 6. Let getter be desc.[[Get]].
      var getter = desc.get;

      /*
        7. If getter is undefined, return undefined.
        8. Return ? Call(getter, Receiver). 
       */
      {
        let type = typeof getter;
        if (type === "undefined") {
          return undefined;
        }
        if (type !== "function") {
          throwAndLog("getter is not a function", "ObjectGraphHandler:get", this.membrane?.logger);
        }
        rv = this.externalHandler(function () {
          return Reflect.apply(getter, receiver, []);
        });
        found = true;
      }
    }

    if (!found) {
      // end of the algorithm
      throwAndLog(
        "Membrane fall-through: we should not get here",
        "ObjectGraphHandler:get",
        this.membrane?.logger
      );
    }

    return rv;
  }

  /**
   * A trap for `Object.getOwnPropertyDescriptor()`.
   * @param shadowTarget The original object which is being proxied.
   * @param propName The name of the property whose description should be retrieved.
   */
  getOwnPropertyDescriptor(
    shadowTarget: object,
    propName: symbol | string
  ): PropertyDescriptor | undefined {
    this.validateTrapAndShadowTarget("getOwnPropertyDescriptor", shadowTarget);

    const mayLog = this.membrane.__mayLog__();
    if (mayLog) {
      this.membrane.logger?.debug(
        "propName: " + propName.toString(),
        "ObjectGraphHandler:getOwnPropertyDescriptor"
      );
    }
    var target = getRealTarget(shadowTarget);
    {
      let [found, unwrapped] = this.membrane.getMembraneValue(this.fieldName, target);
      assert(
        found,
        "Original target must be found after calling getRealTarget",
        "ObjectGraphHandler:getOwnPropertyDescriptor",
        this.membrane?.logger
      );
      assert(
        unwrapped === target,
        "Original target must match getMembraneValue's return value",
        "ObjectGraphHandler:getOwnPropertyDescriptor",
        this.membrane?.logger
      );
    }
    var targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.

    if (this.membrane.showGraphName && propName == "membraneGraphName") {
      let checkDesc = Reflect.getOwnPropertyDescriptor(shadowTarget, propName);
      if (checkDesc && !checkDesc.configurable) {
        return checkDesc;
      }
      return this.graphNameDescriptor;
    }

    try {
      /* Order of operations:
       * (1) locally deleted property:  undefined
       * (2) locally set property:  the property
       * (3) own keys filtered property: undefined
       * (4) original property:  wrapped property.
       */
      if (
        targetMap.wasDeletedLocally(targetMap.originField, propName) ||
        targetMap.wasDeletedLocally(this.fieldName, propName)
      ) {
        return undefined;
      }

      var desc = targetMap.getLocalDescriptor(this.fieldName, propName);
      if (desc !== undefined) {
        return desc;
      }

      {
        let originFilter = targetMap.getOwnKeysFilter(targetMap.originField);
        if (originFilter && !originFilter(propName)) {
          return undefined;
        }
      }
      {
        let localFilter = targetMap.getOwnKeysFilter(this.fieldName);
        if (localFilter && !localFilter(propName)) {
          return undefined;
        }
      }

      var _this = targetMap.getOriginal();
      desc = this.externalHandler(function () {
        return Reflect.getOwnPropertyDescriptor(_this, propName);
      });

      // See .getPrototypeOf trap comments for why this matters.
      const isProtoDesc = propName === "prototype" && isDataDescriptor(desc);
      const isForeign = desc !== undefined && targetMap.originField !== this.fieldName;
      if (isProtoDesc || isForeign) {
        // This is necessary to force desc.value to really be a proxy.
        let configurable = desc!.configurable;
        desc!.configurable = true;
        desc = this.membrane.wrapDescriptor(targetMap.originField, this.fieldName, desc!);
        desc.configurable = configurable!;
      }

      // Non-configurable descriptors must apply on the actual proxy target.
      if (desc && !desc.configurable) {
        let current = Reflect.getOwnPropertyDescriptor(shadowTarget, propName);
        let attempt = Reflect.defineProperty(shadowTarget, propName, desc);
        assert(
          !current || attempt,
          "Non-configurable descriptors must apply on the actual proxy target.",
          "ObjectGraphHandler:getOwnPropertyDescriptor",
          this.membrane?.logger
        );
      }

      // If a shadow target has a non-configurable descriptor, we must return it.
      /* XXX ajvincent It's unclear why this block couldn't go earlier in this
       * function.  There's either a bug here, or a gap in my own understanding.
       */
      {
        let shadowDesc = Reflect.getOwnPropertyDescriptor(shadowTarget, propName);
        if (shadowDesc) {
          return shadowDesc;
        }
      }

      return desc;
    } catch (e: any) {
      if (mayLog) {
        this.membrane.logger?.error(e.message, "ObjectGraphHandler:getOwnPropertyDescriptor", e);
      }
      throw e;
    }
  }

  /**
   * A trap for the `[[GetPrototypeOf]]` internal method.
   * @param shadowTarget The original object which is being proxied.
   */
  getPrototypeOf(shadowTarget: object): object | null {
    this.validateTrapAndShadowTarget("getPrototypeOf", shadowTarget);

    /* Prototype objects are special in JavaScript, but with proxies there is a
     * major drawback.  If the prototype property of a function is
     * non-configurable on the proxy target, the proxy is required to return the
     * proxy target's actual prototype property instead of a wrapper.  You might
     * think "just store the wrapped prototype on the shadow target," and maybe
     * that would work.
     *
     * The trouble arises when you have multiple objects sharing the same
     * prototype object (either through .prototype on functions or through
     * Reflect.getPrototypeOf on ordinary objects).  Some of them may be frozen,
     * others may be sealed, still others not.  The point is .getPrototypeOf()
     * doesn't have a non-configurability requirement to exactly match the way
     * the .prototype property lookup does.
     *
     * It's also for this reason that getPrototypeOf and setPrototypeOf were
     * completely rewritten to more directly use the real prototype chain.
     *
     * One more thing:  it is a relatively safe practice to use a proxy to add,
     * remove or modify individual properties, and ModifyRulesAPI.js supports
     * that in several flavors.  It is doable, but NOT safe, to alter the
     * prototype chain in such a way that breaks the perfect mirroring between
     * object graphs.  Thus, this membrane code will never directly support that
     * as an option.  If you really insist, you should look at either
     * ModifyRulesAPI.prototype.replaceProxy(), or replacing the referring
     * membrane proxy in the object graph with its own shadow target.
     *
     * XXX ajvincent update this comment after fixing #76 to specify how the
     * user will extract the shadow target.
     */
    const target = getRealTarget(shadowTarget);
    const targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.

    try {
      const proto = Reflect.getPrototypeOf(target);
      let proxy;
      if (targetMap.originField !== this.fieldName) {
        proxy = this.membrane.convertArgumentToProxy(
          this.membrane.getHandlerByName(targetMap.originField),
          this,
          proto
        );
      } else {
        proxy = proto;
      }

      let pMapping = this.membrane.map.get(proxy);
      if (pMapping && pMapping.originField !== this.fieldName) {
        assert(
          Reflect.setPrototypeOf(shadowTarget, proxy),
          "shadowTarget could not receive prototype?",
          "ObjectGraphHandler:getPrototypeOf",
          this.membrane?.logger
        );
      }
      return proxy;
    } catch (e: any) {
      if (this.membrane.__mayLog__()) {
        this.membrane.logger?.error(e.message, "ObjectGraphHandler:getPrototypeOf", e);
      }
      throw e;
    }
  }

  /**
   * A trap for `Object.isExtensible()`.
   * @param shadowTarget The original object which is being proxied.
   */
  isExtensible(shadowTarget: object): boolean {
    this.validateTrapAndShadowTarget("isExtensible", shadowTarget);

    if (!Reflect.isExtensible(shadowTarget)) {
      return false;
    }
    var target = getRealTarget(shadowTarget);
    var shouldBeLocal = this.getLocalFlag(target, "storeUnknownAsLocal", true);
    if (shouldBeLocal) {
      return true;
    }

    var targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    var _this = targetMap.getOriginal();

    var rv = this.externalHandler(function () {
      return Reflect.isExtensible(_this);
    });

    if (!rv) {
      // This is our one and only chance to set properties on the shadow target.
      this.lockShadowTarget(shadowTarget);
    }

    return rv;
  }

  /**
   * A trap for `Object.preventExtensions()`.
   * @param shadowTarget The original object which is being proxied.
   */
  preventExtensions(shadowTarget: object): boolean {
    this.validateTrapAndShadowTarget("preventExtensions", shadowTarget);

    var target = getRealTarget(shadowTarget);
    var targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    var _this = targetMap.getOriginal();

    // Walk the prototype chain to look for shouldBeLocal.
    var shouldBeLocal = this.getLocalFlag(target, "storeUnknownAsLocal", true);

    if (!shouldBeLocal && !this.isExtensible(shadowTarget)) {
      return true;
    }

    // This is our one and only chance to set properties on the shadow target.
    var rv = this.lockShadowTarget(shadowTarget);

    if (!shouldBeLocal) {
      rv = Reflect.preventExtensions(_this);
    }
    return rv;
  }

  /**
   * A trap for the `delete` operator.
   * @param shadowTarget The original object which is being proxied.
   * @param propName The name or `Symbol` of the property to delete.
   * @returns A `Boolean` indicating whether or not the property was deleted.
   */
  deleteProperty(shadowTarget: object, propName: symbol | string): boolean {
    this.validateTrapAndShadowTarget("deleteProperty", shadowTarget);

    var target = getRealTarget(shadowTarget);
    const mayLog = this.membrane.__mayLog__();
    if (mayLog) {
      this.membrane.logger?.debug(
        "propName: " + propName.toString(),
        "ObjectGraphHandler:deleteProperty"
      );
    }

    /*
    http://www.ecma-international.org/ecma-262/7.0/#sec-ordinarydelete

    Assert: IsPropertyKey(P) is true.
    Let desc be ? O.[[GetOwnProperty]](P).
    If desc is undefined, return true.
    If desc.[[Configurable]] is true, then
        Remove the own property with name P from O.
        Return true.
    Return false. 
    */

    // 1. Assert: IsPropertyKey(P) is true.
    AssertIsPropertyKey(propName, "ObjectGraphHandler:deleteProperty", this.membrane?.logger);
    var targetMap, shouldBeLocal;

    try {
      targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
      shouldBeLocal = this.requiresDeletesBeLocal(target);

      if (!shouldBeLocal) {
        /* See .defineProperty trap for why.  Basically, if the property name
         * is blacklisted, we should treat it as if the property doesn't exist
         * on the original target.  The spec says if GetOwnProperty returns
         * undefined (which it will for our proxy), we should return true.
         */

        let originFilter = targetMap.getOwnKeysFilter(targetMap.originField);
        let localFilter = targetMap.getOwnKeysFilter(this.fieldName);
        if (originFilter || localFilter) {
          this.membrane.warnOnce(
            this.membrane.constants.warnings.FILTERED_KEYS_WITHOUT_LOCAL,
            "ObjectGraphHandler:deleteProperty"
          );
        }
        if (originFilter && !originFilter(propName)) {
          return true;
        }
        if (localFilter && !localFilter(propName)) {
          return true;
        }
      }
    } catch (e: any) {
      if (mayLog) {
        this.membrane.logger?.error(e.message, "ObjectGraphHandler:deleteProperty", e);
      }
      throw e;
    }

    let desc = this.getOwnPropertyDescriptor(shadowTarget, propName);
    if (!desc) {
      return true;
    }

    if (!desc.configurable) {
      return false;
    }

    try {
      targetMap.deleteLocalDescriptor(this.fieldName, propName, shouldBeLocal);

      if (!shouldBeLocal) {
        var _this = targetMap.getOriginal();
        this.externalHandler(function () {
          return Reflect.deleteProperty(_this, propName);
        });
      }

      Reflect.deleteProperty(shadowTarget, propName);
      this.setOwnKeys(shadowTarget);

      return true;
    } catch (e: any) {
      if (mayLog) {
        this.membrane.logger?.error(e.message, "ObjectGraphHandler:deleteProperty", e);
      }
      throw e;
    }
  }
  /**
   * A trap for `Object.defineProperty()`.
   * @param shadowTarget The target object.
   * @param propName The name of the property to define.
   * @param desc The descriptor for the property being defined or modified.
   * @param shouldBeLocal True if the property must be defined only on the proxy (versus carried over to the actual target).
   * @returns A `Boolean` indicating whether or not the property has been defined.
   *
   * @note This is a ProxyHandler trap for defineProperty, modified to include the shouldBeLocal argument.
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/handler/defineProperty
   */
  defineProperty(
    shadowTarget: object,
    propName: symbol | string,
    desc: PropertyDescriptor,
    shouldBeLocal: boolean = false
  ): boolean {
    this.validateTrapAndShadowTarget("defineProperty", shadowTarget);

    var target = getRealTarget(shadowTarget);
    /* Regarding the funny indentation:  With long names such as defineProperty,
     * inGraphHandler, and shouldBeLocal, it's hard to make everything fit
     * within 80 characters on a line, and properly indent only two spaces.
     * I choose descriptiveness and preserving commit history over reformatting.
     */
    const mayLog = this.membrane.__mayLog__();
    if (mayLog) {
      this.membrane.logger?.debug(
        "propName: " + propName.toString(),
        "ObjectGraphHandler:defineProperty"
      );
    }

    if (this.membrane.showGraphName && propName == "membraneGraphName") {
      return Reflect.defineProperty(shadowTarget, propName, desc);
    }

    try {
      var targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
      var _this = targetMap.getOriginal();

      if (!shouldBeLocal) {
        // Walk the prototype chain to look for shouldBeLocal.
        shouldBeLocal = this.getLocalFlag(target, "storeUnknownAsLocal", true);
      }

      var rv, originFilter, localFilter;

      {
        /* It is dangerous to have an ownKeys filter and define a non-local
         * property.  It will work when the property name passes through the
         * filters.  But when that property name is not permitted, then we can
         * get some strange side effects.
         *
         * Specifically, if the descriptor's configurable property is set to
         * false, either the shadow target must get the property, or an
         * exception is thrown.
         *
         * If the descriptor's configurable property is true, the ECMAScript
         * specification doesn't object...
         *
         * In either case, the property would be set, but never retrievable.  I
         * think this is fundamentally a bad thing, so I'm going to play it safe
         * and return false here, denying the property being set on either the
         * proxy or the protected target.
         */
        originFilter = targetMap.getOwnKeysFilter(targetMap.originField);
        localFilter = targetMap.getOwnKeysFilter(this.fieldName);
        if (originFilter || localFilter) {
          this.membrane.warnOnce(
            this.membrane.constants.warnings.FILTERED_KEYS_WITHOUT_LOCAL,
            "ObjectGraphHandler:defineProperty"
          );
        }
      }

      if (shouldBeLocal) {
        if (!Reflect.isExtensible(shadowTarget)) {
          return Reflect.defineProperty(shadowTarget, propName, desc);
        }

        let hasOwn = true;

        // Own-keys filters modify hasOwn.
        if (hasOwn && originFilter && !originFilter(propName)) {
          hasOwn = false;
        }
        if (hasOwn && localFilter && !localFilter(propName)) {
          hasOwn = false;
        }

        // It's probably more expensive to look up a property than to filter the name.
        if (hasOwn) {
          hasOwn = this.externalHandler(function () {
            return Boolean(Reflect.getOwnPropertyDescriptor(_this, propName));
          });
        }

        if (!hasOwn && desc) {
          rv = targetMap.setLocalDescriptor(this.fieldName, propName, desc);
          if (rv) {
            this.setOwnKeys(shadowTarget);
          } // fix up property list
          if (!desc.configurable) {
            Reflect.defineProperty(shadowTarget, propName, desc);
          }
          return rv;
        } else {
          targetMap.deleteLocalDescriptor(this.fieldName, propName, false);
          // fall through to Reflect's defineProperty
        }
      } else {
        if (originFilter && !originFilter(propName)) {
          return false;
        }
        if (localFilter && !localFilter(propName)) {
          return false;
        }
      }

      if (desc !== undefined) {
        desc = this.membrane.wrapDescriptor(this.fieldName, targetMap.originField, desc);
      }

      rv = this.externalHandler(function () {
        return Reflect.defineProperty(_this, propName, desc);
      });
      if (rv) {
        targetMap.unmaskDeletion(this.fieldName, propName);
        this.setOwnKeys(shadowTarget); // fix up property list

        if (!desc.configurable) {
          Reflect.defineProperty(shadowTarget, propName, desc);
        }
      }
      return rv;
    } catch (e: any) {
      if (mayLog) {
        this.membrane.logger?.error(e.message, "ObjectGraphHandler:defineProperty", e);
      }
      throw e;
    }
  }

  /**
   * A trap for setting a property value.
   * @param shadowTarget The original object which is being proxied.
   * @param propName The name or `Symbol` of the property to set.
   * @param receiver The object to which the assignment was originally directed.
   * @returns A `Boolean` indicating whether or not the property was set.
   */
  set(shadowTarget: object, propName: symbol | string, value: unknown, receiver: object): boolean {
    this.validateTrapAndShadowTarget("set", shadowTarget);

    const mayLog = this.membrane.__mayLog__();
    if (mayLog) {
      this.membrane.logger?.debug("set propName: " + propName.toString(), "ObjectGraphHandler:set");
    }
    let target = getRealTarget(shadowTarget);

    /*
      http://www.ecma-international.org/ecma-262/7.0/#sec-ordinary-object-internal-methods-and-internal-slots-set-p-v-receiver
  
      1. Assert: IsPropertyKey(P) is true.
      2. Let ownDesc be ? O.[[GetOwnProperty]](P).
      3. If ownDesc is undefined, then
          a. Let parent be ? O.[[GetPrototypeOf]]().
          b. If parent is not null, then
              i.   Return ? parent.[[Set]](P, V, Receiver).
          c. Else,
              i.   Let ownDesc be the PropertyDescriptor{
                     [[Value]]: undefined,
                     [[Writable]]: true,
                     [[Enumerable]]: true,
                     [[Configurable]]: true
                   }.
      4. If IsDataDescriptor(ownDesc) is true, then
          a. If ownDesc.[[Writable]] is false, return false.
          b. If Type(Receiver) is not Object, return false.
          c. Let existingDescriptor be ? Receiver.[[GetOwnProperty]](P).
          d. If existingDescriptor is not undefined, then
              i.   If IsAccessorDescriptor(existingDescriptor) is true, return false.
              ii.  If existingDescriptor.[[Writable]] is false, return false.
              iii. Let valueDesc be the PropertyDescriptor{[[Value]]: V}.
              iv.  Return ? Receiver.[[DefineOwnProperty]](P, valueDesc).
          e. Else Receiver does not currently have a property P,
              i.   Return ? CreateDataProperty(Receiver, P, V).
      5. Assert: IsAccessorDescriptor(ownDesc) is true.
      6. Let setter be ownDesc.[[Set]].
      7. If setter is undefined, return false.
      8. Perform ? Call(setter, Receiver, « V »).
      9. Return true. 
      */

    /* Optimization:  Recursively calling this.set() is a pain in the neck,
     * especially for the stack trace.  So let's use a do...while loop to reset
     * only the entry arguments we need (specifically, shadowTarget, target).
     * We should exit the loop with desc, or return from the function.
     */

    // 1. Assert: IsPropertyKey(P) is true.
    AssertIsPropertyKey(propName, "ObjectGraphHandler:set", this.membrane?.logger);

    var ownDesc,
      shouldBeLocal = this.getLocalFlag(target, "storeUnknownAsLocal", true);

    do {
      /*
        2. Let ownDesc be ? O.[[GetOwnProperty]](P).
        3. If ownDesc is undefined, then
            a. Let parent be ? O.[[GetPrototypeOf]]().
            b. If parent is not null, then
                i.   Return ? parent.[[Set]](P, V, Receiver).
            c. Else,
                i.   Let ownDesc be the PropertyDescriptor{
                       [[Value]]: undefined,
                       [[Writable]]: true,
                       [[Enumerable]]: true,
                       [[Configurable]]: true
                     }.
        */

      let pMapping = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
      let shadow = pMapping.getShadowTarget(this.fieldName);
      ownDesc = this.getOwnPropertyDescriptor(shadow, propName);
      if (ownDesc) {
        break;
      }

      {
        let parent = this.getPrototypeOf(shadow);
        if (parent === null) {
          ownDesc = new DataDescriptor(undefined, true);
          break;
        }

        let found = this.membrane.getMembraneProxy(this.fieldName, parent)[0];
        assert(
          found,
          "Must find membrane proxy for prototype",
          "ObjectGraphHandler:set",
          this.membrane?.logger
        );
        let sMapping = this.membrane.map.get(parent);
        assert(
          sMapping,
          "Missing a ProxyMapping?",
          "ObjectGraphHandler:set",
          this.membrane?.logger
        );

        if (sMapping.originField != this.fieldName) {
          [found, target] = this.membrane.getMembraneValue(this.fieldName, parent);
          assert(
            found,
            "Must find membrane value for prototype",
            "ObjectGraphHandler:set",
            this.membrane?.logger
          );
        } else {
          target = parent;
        }
      }
    } while (true); // end optimization for ownDesc

    // Special step:  convert receiver to unwrapped value.
    let receiverMap = this.membrane.map.get(receiver);
    if (!receiverMap) {
      // We may be under construction.
      let proto = Object.getPrototypeOf(receiver);
      let protoMap = this.membrane.map.get(proto)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
      let pHandler = this.membrane.getHandlerByName(protoMap.originField);

      if (this.membrane.map.has(receiver)) {
        /* XXX ajvincent If you're stepping through in a debugger, the debugger
         * may have set this.membrane.map.get(receiver) between actions.
         * This is a true Heisenbug, where observing the behavior changes the
         * behavior.
         *
         * Therefore YOU MUST STEP OVER THE FOLLOWING LINE!  DO NOT STEP IN!
         * DO NOT FOOL AROUND WITH THE DEBUGGER, JUST STEP OVER!!!
         */
        this.membrane.convertArgumentToProxy(pHandler, this, receiver, { override: true });
      } else {
        this.membrane.convertArgumentToProxy(pHandler, this, receiver);
      }

      receiverMap = this.membrane.map.get(receiver);
      if (!receiverMap) {
        throwAndLog(
          "How do we still not have a receiverMap?",
          "ObjectGraphHandler:set",
          this.membrane?.logger
        );
      }
      if (receiverMap.originField === this.fieldName) {
        throwAndLog(
          "Receiver's field name should not match!",
          "ObjectGraphHandler:set",
          this.membrane?.logger
        );
      }
    }

    /*
      4. If IsDataDescriptor(ownDesc) is true, then
          a. If ownDesc.[[Writable]] is false, return false.
          b. If Type(Receiver) is not Object, return false.
          c. Let existingDescriptor be ? Receiver.[[GetOwnProperty]](P).
          d. If existingDescriptor is not undefined, then
              i.   If IsAccessorDescriptor(existingDescriptor) is true, return false.
              ii.  If existingDescriptor.[[Writable]] is false, return false.
              iii. Let valueDesc be the PropertyDescriptor{[[Value]]: V}.
              iv.  Return ? Receiver.[[DefineOwnProperty]](P, valueDesc).
          e. Else Receiver does not currently have a property P,
              i.   Return ? CreateDataProperty(Receiver, P, V).
      */
    if (isDataDescriptor(ownDesc)) {
      if (!ownDesc.writable || valueType(receiver) == "primitive") {
        return false;
      }

      let origReceiver = receiverMap.getOriginal();
      let existingDesc = this.externalHandler(function () {
        return Reflect.getOwnPropertyDescriptor(origReceiver, propName);
      });
      if (existingDesc !== undefined) {
        if (isAccessorDescriptor(existingDesc) || !existingDesc.writable) {
          return false;
        }
      }

      let rvProxy;
      if (!shouldBeLocal && receiverMap.originField !== this.fieldName) {
        rvProxy = new DataDescriptor(
          // Only now do we convert the value to the target object graph.
          this.membrane.convertArgumentToProxy(
            this,
            this.membrane.getHandlerByName(receiverMap.originField),
            value
          ),
          true
        );
      } else {
        rvProxy = new DataDescriptor(value, true);
      }

      if (!ownDesc.configurable) {
        rvProxy.configurable = false;
        rvProxy.enumerable = ownDesc.enumerable;
      }

      return this.defineProperty(this.getShadowTarget(receiver), propName, rvProxy, shouldBeLocal);
    }

    // 5. Assert: IsAccessorDescriptor(ownDesc) is true.
    if (!isAccessorDescriptor(ownDesc)) {
      throwAndLog(
        "ownDesc must be a data descriptor or an accessor descriptor!",
        "ObjectGraphHandler:set",
        this.membrane?.logger
      );
    }

    /*
      6. Let setter be ownDesc.[[Set]].
      7. If setter is undefined, return false.
      */
    let setter = ownDesc.set;
    if (typeof setter === "undefined") {
      return false;
    }

    if (!this.membrane.hasProxyForValue(this.fieldName, setter)) {
      this.membrane.buildMapping(this, setter);
    }

    // 8. Perform ? Call(setter, Receiver, « V »).

    if (!shouldBeLocal) {
      // Only now do we convert the value to the target object graph.
      let rvProxy = this.membrane.convertArgumentToProxy(
        this,
        this.membrane.getHandlerByName(receiverMap.originField),
        value
      );
      this.apply(this.getShadowTarget(setter), receiver, [rvProxy]);
    } else {
      this.defineProperty(
        this.getShadowTarget(receiver),
        propName,
        new DataDescriptor(value),
        shouldBeLocal
      );
    }

    // 9. Return true.
    return true;
  }

  /**
   * A trap for `Object.setPrototypeOf()`.
   * @param shadowTarget The original object which is being proxied.
   * @param proto The object's new prototype or `null`.
   */
  setPrototypeOf(shadowTarget: object, proto: object): boolean {
    this.validateTrapAndShadowTarget("setPrototypeOf", shadowTarget);

    var target = getRealTarget(shadowTarget);
    try {
      var targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
      var _this = targetMap.getOriginal();

      let protoProxy, wrappedProxy, found;
      if (targetMap.originField !== this.fieldName) {
        protoProxy = this.membrane.convertArgumentToProxy(
          this,
          this.membrane.getHandlerByName(targetMap.originField),
          proto
        );
        [found, wrappedProxy] = this.membrane.getMembraneProxy(this.fieldName, proto);
        assert(
          found,
          "Membrane proxy not found immediately after wrapping!",
          "ObjectGraphHandler:setPrototypeOf",
          this.membrane?.logger
        );
      } else {
        protoProxy = proto;
        wrappedProxy = proto;
      }

      var rv = this.externalHandler(function () {
        return Reflect.setPrototypeOf(_this, protoProxy);
      });
      if (rv) {
        assert(
          Reflect.setPrototypeOf(shadowTarget, wrappedProxy),
          "shadowTarget could not receive prototype?",
          "ObjectGraphHandler:setPrototypeOf",
          this.membrane?.logger
        );
      }

      return rv;
    } catch (e: any) {
      const mayLog = this.membrane.__mayLog__();
      if (mayLog) {
        this.membrane.logger?.error(e.message, "ObjectGraphHandler:setPrototypeOf", e);
      }
      throw e;
    }
  }

  /**
   * A trap method for a function call.
   * @param shadowTarget The original callable object which is being proxied.
   * @param thisArg The object to which the function is bound.
   * @param argumentsList The arguments passed to the function.
   */
  apply(shadowTarget: object, thisArg: unknown, argumentsList: unknown[]): unknown {
    this.validateTrapAndShadowTarget("apply", shadowTarget);

    var target = getRealTarget(shadowTarget) as (...args: unknown[]) => unknown;
    var _this: unknown,
      args: unknown[] = [];
    let targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    let argHandler = this.membrane.getHandlerByName(targetMap.originField);

    const mayLog = this.membrane.__mayLog__();
    if (mayLog) {
      this.membrane.logger?.debug(
        [
          "apply originFields: inbound = ",
          argHandler.fieldName,
          ", outbound = ",
          this.fieldName
        ].join(""),
        "ObjectGraphHandler:apply"
      );
    }

    argumentsList = this.truncateArguments(target, argumentsList);

    // This is where we are "counter-wrapping" an argument.
    const optionsBase = Object.seal({
      callable: target,
      trapName: "apply"
    });

    if (targetMap.originField !== this.fieldName) {
      _this = this.membrane.convertArgumentToProxy(
        this,
        argHandler,
        thisArg,
        Object.create(optionsBase, { "isThis": new DataDescriptor(true) })
      );

      for (let i = 0; i < argumentsList.length; i++) {
        let nextArg = argumentsList[i];
        nextArg = this.membrane.convertArgumentToProxy(
          this,
          argHandler,
          nextArg,
          Object.create(optionsBase, { "argIndex": new DataDescriptor(i) })
        );
        args.push(nextArg);
      }
    } else {
      _this = thisArg;
      args = argumentsList.slice(0);
    }

    if (mayLog) {
      this.membrane.logger?.debug("apply about to call function", "ObjectGraphHandler:apply");
    }

    this.notifyFunctionListeners("enter", "apply", target, undefined, argHandler);

    var rv;
    try {
      rv = this.externalHandler(function () {
        return Reflect.apply(target, _this, args);
      });
    } catch (ex) {
      this.notifyFunctionListeners("throw", "apply", target, ex, argHandler);
      throw ex;
    }

    if (mayLog) {
      this.membrane.logger?.debug("apply wrapping return value", "ObjectGraphHandler:apply");
    }

    if (targetMap.originField !== this.fieldName) {
      rv = this.membrane.convertArgumentToProxy(argHandler, this, rv);
    }

    /* This is a design decision, to pass the wrapped proxy object instead of
     * the unwrapped value.  There's no particular reason for it, except that I
     * wanted to ensure that the returned value had been wrapped before invoking
     * the listener (so that both the proxy and the unwrapped value could be
     * found from the membrane).  Once the wrapping is done, we could pass the
     * unwrapped value if we wanted... but there's no particular reason to favor
     * the proxy versus the unwrapped value, or vice versa.
     */
    this.notifyFunctionListeners("return", "apply", target, rv, argHandler);

    if (mayLog) {
      this.membrane.logger?.debug("apply exiting", "ObjectGraphHandler:apply");
    }
    return rv;
  }

  /**
   * A trap for the `new` operator.
   * @param shadowTarget The original object which is being proxied.
   * @param ctorTarget The constructor that was originally called.
   */
  construct(shadowTarget: object, argumentsList: any[], ctorTarget: Function): object {
    this.validateTrapAndShadowTarget("construct", shadowTarget);

    var target = getRealTarget(shadowTarget) as (...args: unknown[]) => unknown;
    var args: unknown[] = [];
    let targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    let argHandler = this.membrane.getHandlerByName(targetMap.originField);

    const mayLog = this.membrane.__mayLog__();
    if (mayLog) {
      this.membrane.logger?.debug(
        [
          "construct originFields: inbound = ",
          argHandler.fieldName,
          ", outbound = ",
          this.fieldName
        ].join(""),
        "ObjectGraphHandler:construct"
      );
    }

    argumentsList = this.truncateArguments(target, argumentsList);

    // This is where we are "counter-wrapping" an argument.
    const optionsBase = Object.seal({
      callable: target,
      trapName: "construct"
    });

    for (let i = 0; i < argumentsList.length; i++) {
      let nextArg = argumentsList[i];
      nextArg = this.membrane.convertArgumentToProxy(
        this,
        argHandler,
        nextArg,
        Object.create(optionsBase, { "argIndex": new DataDescriptor(i) })
      );
      args.push(nextArg);

      if (mayLog && valueType(nextArg) != "primitive") {
        this.membrane.logger?.debug(
          "construct argument " + i + "'s membraneGraphName: " + nextArg.membraneGraphName,
          "ObjectGraphHandler:construct"
        );
      }
    }

    const ctor = this.membrane.convertArgumentToProxy(this, argHandler, ctorTarget);

    this.notifyFunctionListeners("enter", "construct", target, undefined, argHandler);

    var rv;

    try {
      rv = this.externalHandler(function () {
        return Reflect.construct(target, args, ctor);
      });
    } catch (ex) {
      this.notifyFunctionListeners("throw", "construct", target, ex, argHandler);
      throw ex;
    }

    rv = this.membrane.convertArgumentToProxy(argHandler, this, rv);

    /* This is a design decision, to pass the wrapped proxy object instead of
     * the unwrapped value.  There's no particular reason for it, except that I
     * wanted to ensure that the returned value had been wrapped before invoking
     * the listener (so that both the proxy and the unwrapped value could be
     * found from the membrane).  Once the wrapping is done, we could pass the
     * unwrapped value if we wanted... but there's no particular reason to favor
     * the proxy versus the unwrapped value, or vice versa.
     */
    this.notifyFunctionListeners("return", "construct", target, rv, argHandler);

    if (mayLog) {
      this.membrane.logger?.debug("construct exiting", "ObjectGraphHandler:construct");
    }
    return rv;
  }

  /**
   * Ensure the first argument is a known shadow target.
   * @param trapName The name of the trap to run.
   * @param shadowTarget The supposed target.
   * @private
   */
  validateTrapAndShadowTarget(trapName: keyof ObjectGraphHandler, shadowTarget: object): void {
    const target = getRealTarget(shadowTarget);
    const targetMap = this.membrane.map.get(target);
    if (!(targetMap instanceof ProxyMapping)) {
      throwAndLog(
        "No ProxyMapping found for shadow target!",
        "ObjectGraphHandler:validateTrapAndShadowTarget",
        this.membrane?.logger
      );
    }
    if (!targetMap.isShadowTarget(shadowTarget)) {
      throwAndLog(
        "ObjectGraphHandler traps must be called with a shadow target!",
        "ObjectGraphHandler:validateTrapAndShadowTarget",
        this.membrane?.logger
      );
    }
    const disableTrapFlag = `disableTrap(${trapName})`;
    if (
      targetMap.getLocalFlag(this.fieldName, disableTrapFlag) ||
      targetMap.getLocalFlag(targetMap.originField, disableTrapFlag)
    ) {
      throwAndLog(
        `The ${trapName} trap is not executable.`,
        "ObjectGraphHandler:validateTrapAndShadowTarget",
        this.membrane?.logger
      );
    }
  }

  /**
   * Get the shadow target associated with a real value.
   */
  private getShadowTarget(target: object): object {
    let targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    return targetMap.getShadowTarget(this.fieldName);
  }

  /**
   * Ensure a value has been wrapped in the membrane (and is available for distortions)
   * @param target The value to wrap.
   */
  ensureMapping(target: object): void {
    if (!this.membrane.hasProxyForValue(this.fieldName, target)) {
      this.membrane.buildMapping(this, target);
    }
  }

  /**
   * Add a listener for new proxies.
   * @see ProxyNotify
   */
  addProxyListener(listener: ProxyListener): void {
    if (typeof listener != "function") {
      throwAndLog(
        "listener is not a function!",
        "ObjectGraphHandler:addProxyListener",
        this.membrane?.logger
      );
    }
    if (!this.__proxyListeners__.includes(listener)) {
      this.__proxyListeners__.push(listener);
    }
  }

  /**
   * Remove a listener for new proxies.
   * @see ProxyNotify
   */
  removeProxyListener(listener: ProxyListener): void {
    let index = this.__proxyListeners__.indexOf(listener);
    if (index == -1) {
      throwAndLog(
        "listener is not registered!",
        "ObjectGraphHandler:removeProxyListener",
        this.membrane?.logger
      );
    }
    this.__proxyListeners__.splice(index, 1);
  }

  /**
   * Add a listener for function entry, return and throw operations.
   * @param listener The listener to add.
   * @see ObjectGraphHandler.prototype.notifyFunctionListeners for what each listener will get for its arguments.
   */
  addFunctionListener(listener: FunctionListener): void {
    if (typeof listener != "function") {
      throwAndLog(
        "listener is not a function!",
        "ObjectGraphHandler:addFunctionListener",
        this.membrane?.logger
      );
    }
    if (!this.__functionListeners__.includes(listener)) {
      this.__functionListeners__.push(listener);
    }
  }

  /**
   * Add a listener for function entry, return and throw operations.
   * @param listener The listener to remove.
   */
  removeFunctionListener(listener: FunctionListener): void {
    let index = this.__functionListeners__.indexOf(listener);
    if (index == -1) {
      throwAndLog(
        "listener is not registered!",
        "ObjectGraphHandler:removeFunctionListener",
        this.membrane?.logger
      );
    }
    this.__functionListeners__.splice(index, 1);
  }

  /**
   * Notify listeners we are transitioning from one object graph to another for
   * a function call.
   *
   * @param reason   Either "enter", "return" or "throw".
   * @param trapName Either "apply" or "construct".
   * @param target   The unwrapped target we call.
   * @param rvOrExn  If reason is "enter", undefined.
   *                 If reason is "return", the return value.
   *                 If reason is "throw", the exception.
   * @param origin   The origin graph handler.
   */
  private notifyFunctionListeners(
    reason: "enter" | "return" | "throw",
    trapName: "apply" | "construct",
    target: object,
    rvOrExn: any,
    origin: ObjectGraphHandler
  ): void {
    let listeners: FunctionListener[];
    {
      let ourListeners = this.__functionListeners__.slice(0);
      let nativeListeners = origin.__functionListeners__.slice(0);
      let membraneListeners = this.membrane.__functionListeners__.slice(0);
      listeners = ourListeners.concat(nativeListeners, membraneListeners);
    }
    if (listeners.length === 0) {
      return;
    }

    const args: Parameters<FunctionListener> = [
      reason,
      trapName,
      this.fieldName,
      origin.fieldName,
      target,
      rvOrExn
    ];
    Object.freeze(args);

    listeners.forEach((func) => {
      try {
        func.apply(null, args);
      } catch (ex: any) {
        if (this.membrane.__mayLog__()) {
          try {
            this.membrane.logger?.error(
              typeof ex === "object" && ex !== null ? ex.message : "unknown error",
              "ObjectGraphHandler:notifyFunctionListeners",
              ex
            );
          } catch (ex2) {
            // do nothing
          }
        }
      }
    }, this);
  }

  /**
   * Handle a call to code the membrane doesn't control.
   * @private
   */
  externalHandler<T extends (...args: unknown[]) => any>(callback: T): ReturnType<T> {
    return callback.apply(this);
  }

  /**
   * Set all properties on a shadow target, including prototype, and seal it.
   */
  private lockShadowTarget(shadowTarget: object): boolean {
    const target = getRealTarget(shadowTarget);
    const targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    const _this = targetMap.getOriginal();
    const keys = this.setOwnKeys(shadowTarget);
    keys.forEach(function (this: ObjectGraphHandler, propName) {
      if (this.membrane.showGraphName && propName == "membraneGraphName") {
        // Special case.
        Reflect.defineProperty(shadowTarget, propName, this.graphNameDescriptor);
      } else {
        this.defineLazyGetter(_this, shadowTarget, propName);
      }

      // We want to trigger the lazy getter so that the property can be sealed.
      void Reflect.get(shadowTarget, propName);
    }, this);

    // fix the prototype;
    const proto = this.getPrototypeOf(shadowTarget);
    assert(
      Reflect.setPrototypeOf(shadowTarget, proto),
      "Failed to set unwrapped prototype on non-extensible?",
      "ObjectGraphHandler:lockShadowTarget",
      this.membrane?.logger
    );
    return Reflect.preventExtensions(shadowTarget);
  }

  /**
   * Specify the list of ownKeys this proxy exposes.
   *
   * @param shadowTarget The proxy target
   * @private
   *
   * @returns The list of exposed keys.
   */
  setOwnKeys(shadowTarget: object): (string | symbol)[] {
    var target = getRealTarget(shadowTarget);
    var targetMap = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    var _this = targetMap.getOriginal();

    // First, get the underlying object's key list, forming a base.
    var originalKeys = this.externalHandler(function () {
      return Reflect.ownKeys(_this);
    });

    // Remove duplicated names and keys that have been deleted.
    {
      let mustSkip: Set<symbol | string> = new Set();
      targetMap.appendDeletedNames(targetMap.originField, mustSkip);
      targetMap.appendDeletedNames(this.fieldName, mustSkip);

      let originFilter = targetMap.getOwnKeysFilter(targetMap.originField);
      let localFilter = targetMap.getOwnKeysFilter(this.fieldName);

      if (mustSkip.size > 0 || originFilter || localFilter) {
        originalKeys = originalKeys.filter(function (this: ObjectGraphHandler, elem) {
          if (mustSkip.has(elem)) {
            return false;
          }
          if (originFilter && !originFilter.apply(this, arguments as any)) {
            return false;
          }
          if (localFilter && !localFilter.apply(this, arguments as any)) {
            return false;
          }
          return true;
        });
      }
    }

    // Append the local proxy keys.
    var rv;
    {
      let originExtraKeys = targetMap.localOwnKeys(targetMap.originField);
      let targetExtraKeys = targetMap.localOwnKeys(this.fieldName);
      let known = new Set(originalKeys);
      let f = function (key: symbol | string) {
        if (known.has(key)) {
          return false;
        }
        known.add(key);
        return true;
      };
      originExtraKeys = originExtraKeys.filter(f);
      targetExtraKeys = targetExtraKeys.filter(f);
      rv = originalKeys.concat(originExtraKeys, targetExtraKeys);
    }

    if (this.membrane.showGraphName && !rv.includes("membraneGraphName")) {
      rv.push("membraneGraphName");
    }

    // Optimization, storing the generated key list for future retrieval.
    targetMap.setCachedOwnKeys(this.fieldName, rv, originalKeys);

    {
      /* Give the shadow target any non-configurable keys it needs.
           @see http://www.ecma-international.org/ecma-262/7.0/#sec-proxy-object-internal-methods-and-internal-slots-ownpropertykeys
           This code tries to fix steps 17 and 19.
        */

      // trap == rv, in step 5

      // step 9
      const extensibleTarget = Reflect.isExtensible(shadowTarget);

      // step 10
      let targetKeys = Reflect.ownKeys(shadowTarget);

      // step 12, 13
      let targetConfigurableKeys: (symbol | string)[] = [],
        targetNonconfigurableKeys: (symbol | string)[] = [];

      // step 14
      targetKeys.forEach(function (key) {
        let desc = Reflect.getOwnPropertyDescriptor(shadowTarget, key);
        if (desc && !desc.configurable) {
          targetNonconfigurableKeys.push(key);
        } else {
          targetConfigurableKeys.push(key);
        }
      });

      // step 15
      if (extensibleTarget && targetNonconfigurableKeys.length === 0) {
        return rv;
      }

      // step 16
      let uncheckedResultKeys = new Set(rv);

      // step 17
      targetNonconfigurableKeys.forEach(function (propName) {
        if (!uncheckedResultKeys.has(propName)) {
          rv.push(propName);
        }
        uncheckedResultKeys.delete(propName);
      }, this);

      // step 18
      if (extensibleTarget) {
        return rv;
      }

      // step 19
      targetConfigurableKeys.forEach(function (key) {
        if (!uncheckedResultKeys.has(key)) {
          // @ts-expect-error -- ansteg: Typescript says "Cannot find name 'propName'.". This smells like a real bug, but I'm not sure how to fix it at the moment.
          rv.push(propName);
        }
        uncheckedResultKeys.delete(key);
      });

      // step 20
      assert(
        uncheckedResultKeys.size === 0,
        "all required keys should be applied by now",
        "ObjectGraphHandler:setOwnKeys",
        this.membrane?.logger
      );
    }
    return rv;
  }

  /**
   * Define a "lazy" accessor descriptor which replaces itself with a direct
   * property descriptor when needed.
   *
   * @param source The source object holding a property.
   * @param shadowTarget The shadow target for a proxy.
   * @param propName  The name of the property to copy.
   *
   * @returns true if the lazy property descriptor was defined.
   *
   * @private
   */
  defineLazyGetter(source: object, shadowTarget: object, propName: string | symbol): boolean {
    const handler = this;

    let lockState = "none",
      lockedValue: unknown;
    // ansteg: We're being defensive here around potential memory leaks
    //         The idea is to prevent setLockedValue and lazyDesc from capturing a hard reference to the logger in its closure.
    let loggerRef = this.membrane?.logger ? new WeakRef(this.membrane?.logger) : undefined;
    function setLockedValue(value: unknown) {
      /* XXX ajvincent The intent is to mark this accessor descriptor as one
       * that can safely be converted to (new DataDescriptor(value)).
       * Unfortunately, a sealed accessor descriptor has the .configurable
       * property set to false, so we can never replace this getter in that
       * scenario with a data descriptor.  ES7 spec sections 7.3.14
       * (SetIntegrityLevel) and 9.1.6.3 (ValidateAndApplyPropertyDescriptor)
       * force that upon us.
       *
       * I hope that a ECMAScript engine can be written (and a future ES7
       * specification written) that could detect this unbreakable contract and
       * internally convert the accessor descriptor to a data descriptor.  That
       * would be a nice optimization for a "just-in-time" compiler.
       *
       * Simply put:  (1) The only setter for lockedValue is setLockedValue.
       * (2) There are at most only two references to setLockedValue ever, and
       * that only briefly in a recursive chain of proxy creation operations.
       * (3) I go out of our way to ensure all references to the enclosed
       * setLockedValue function go away as soon as possible.  Therefore, (4)
       * when all references to setLockedValue go away, lockedValue is
       * effectively a constant.  (5) lockState can only be set to "finalized"
       * by setLockedState.  (6) the setter for this property has been removed
       * before then.  Therefore, (7) lazyDesc.get() can return only one
       * possible value once lockState has become "finalized", and (8) despite
       * the property descriptor's [[Configurable]] flag being set to false, it
       * is completely safe to convert the property to a data descriptor.
       *
       * Lacking such an automated optimization, it would be nice if a future
       * ECMAScript standard could define
       * Object.lockPropertyDescriptor(obj, propName) which could quickly assert
       * the accessor descriptor really can only generate one value in the
       * future, and then internally do the data conversion.
       */

      // This lockState check should be treated as an assertion.
      if (lockState !== "transient") {
        throwAndLog(
          "setLockedValue should be callable exactly once!",
          "ObjectGraphHandler:defineLazyGetter:setLockedValue",
          loggerRef?.deref()
        );
      }
      lockedValue = value;
      lockState = "finalized";
    }

    const lazyDesc: PropertyDescriptor = {
      get: function () {
        if (lockState === "finalized") {
          return lockedValue;
        }
        if (lockState === "transient") {
          return handler.membrane.getMembraneProxy(handler.fieldName, shadowTarget)[0];
        } // ansteg - this used to be ".proxy" instead of ".[0]", but typescript complained. I'm pretty sure this was a real bug.

        /* When the shadow target is sealed, desc.configurable is not updated.
         * But the shadow target's properties all get the [[Configurable]] flag
         * removed.  So an attempt to delete the property will fail, which means
         * the assert below will throw.
         *
         * The tests required only that an exception be thrown.  However,
         * asserts are for internal errors, and in theory can be disabled at any
         * time:  they're not for catching mistakes by the end-user.  That's why
         * I am deliberately throwing an exception here, before the assert call.
         */
        let current = Reflect.getOwnPropertyDescriptor(shadowTarget, propName)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
        if (!current.configurable) {
          throwAndLog(
            "lazy getter descriptor is not configurable -- this is fatal",
            "ObjectGraphHandler:defineLazyGetter:lazyDesc:get",
            loggerRef?.deref()
          );
        }

        handler.validateTrapAndShadowTarget("defineLazyGetter", shadowTarget);

        const target = getRealTarget(shadowTarget);
        const targetMap = handler.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.

        // sourceDesc is the descriptor we really want
        let sourceDesc =
          targetMap.getLocalDescriptor(handler.fieldName, propName) ||
          Reflect.getOwnPropertyDescriptor(source, propName);

        if (sourceDesc !== undefined && targetMap.originField !== handler.fieldName) {
          let hasUnwrapped = "value" in sourceDesc,
            unwrapped = sourceDesc.value;

          // This is necessary to force desc.value to be wrapped in the membrane.
          let configurable = sourceDesc.configurable;
          sourceDesc.configurable = true;
          sourceDesc = handler.membrane.wrapDescriptor(
            targetMap.originField,
            handler.fieldName,
            sourceDesc
          );
          sourceDesc.configurable = configurable!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.

          if (hasUnwrapped && handler.proxiesInConstruction.has(unwrapped)) {
            /* Ah, nuts.  Somewhere in our stack trace, the unwrapped value has
             * a proxy in this object graph under construction.  That's not
             * supposed to happen very often, but can happen during a recursive
             * Object.seal() or Object.freeze() call.  What that means is that
             * we may not be able to replace the lazy getter (which is an
             * accessor descriptor) with a data descriptor when external code
             * looks up the property on the shadow target.
             */
            handler.proxiesInConstruction.get(unwrapped).push(setLockedValue);
            sourceDesc = lazyDesc;
            delete sourceDesc.set;
            lockState = "transient";
          }
        }

        assert(
          Reflect.deleteProperty(shadowTarget, propName),
          "Couldn't delete original descriptor?",
          "ObjectGraphHandler:defineLazyGetter:lazyDesc:get",
          loggerRef?.deref()
        );
        assert(
          Reflect.defineProperty(this, propName, sourceDesc!),
          "Couldn't redefine shadowTarget with descriptor?",
          "ObjectGraphHandler:defineLazyGetter:lazyDesc:get",
          loggerRef?.deref()
        );

        // Finally, run the actual getter.
        if (sourceDesc === undefined) {
          return undefined;
        }
        if ("get" in sourceDesc) {
          return sourceDesc.get.apply(this);
        }
        if ("value" in sourceDesc) {
          return sourceDesc.value;
        }
        return undefined;
      },

      set: function (value) {
        handler.validateTrapAndShadowTarget("defineLazyGetter", shadowTarget);

        if (valueType(value) !== "primitive") {
          // Maybe we have to wrap the actual descriptor.
          const target = getRealTarget(shadowTarget);
          const targetMap = handler.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
          if (targetMap.originField !== handler.fieldName) {
            let originHandler = handler.membrane.getHandlerByName(targetMap.originField);
            value = handler.membrane.convertArgumentToProxy(originHandler, handler, value);
          }
        }

        /* When the shadow target is sealed, desc.configurable is not updated.
         * But the shadow target's properties all get the [[Configurable]] flag
         * removed.  So an attempt to delete the property will fail, which means
         * the assert below will throw.
         *
         * The tests required only that an exception be thrown.  However,
         * asserts are for internal errors, and in theory can be disabled at any
         * time:  they're not for catching mistakes by the end-user.  That's why
         * I am deliberately throwing an exception here, before the assert call.
         */
        let current = Reflect.getOwnPropertyDescriptor(shadowTarget, propName)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
        if (!current.configurable) {
          throwAndLog(
            "lazy getter descriptor is not configurable -- this is fatal",
            "ObjectGraphHandler:defineLazyGetter:lazyDesc:set",
            loggerRef?.deref()
          );
        }

        const desc = new DataDescriptor(value, true, current.enumerable, true);

        assert(
          Reflect.deleteProperty(shadowTarget, propName),
          "Couldn't delete original descriptor?",
          "ObjectGraphHandler:defineLazyGetter:lazyDesc:set",
          loggerRef?.deref()
        );
        assert(
          Reflect.defineProperty(this, propName, desc),
          "Couldn't redefine shadowTarget with descriptor?",
          "ObjectGraphHandler:defineLazyGetter:lazyDesc:set",
          loggerRef?.deref()
        );

        return value;
      },

      enumerable: true,
      configurable: true
    };

    {
      handler.membrane.buildMapping(handler, lazyDesc.get);
      handler.membrane.buildMapping(handler, lazyDesc.set);
    }

    {
      let current = Reflect.getOwnPropertyDescriptor(source, propName);
      if (current && !current.enumerable) {
        lazyDesc.enumerable = false;
      }
    }

    return Reflect.defineProperty(shadowTarget, propName, lazyDesc);
  }

  /**
   * Determine if a target, or any prototype ancestor, has a local-to-the-proxy
   * flag.
   *
   * @argument target The proxy target.
   * @argument flagName The name of the flag.
   * @argument recurse True if we should look at prototype ancestors.
   *
   * @returns True if local properties have been requested.
   */
  private getLocalFlag(target: object, flagName: string, recurse?: boolean): boolean {
    let map = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    const field = this.fieldName;
    const originField = map.originField;
    while (true) {
      let shouldBeLocal =
        map.getLocalFlag(field, flagName) || map.getLocalFlag(originField, flagName);
      if (shouldBeLocal) {
        return true;
      }
      if (!recurse) {
        return false;
      }
      let shadowTarget = map.getShadowTarget(this.fieldName);

      /* XXX ajvincent I suspect this assertion might fail if
       * this.fieldName == map.originField:  if the field represents an original
       * value.
       */
      assert(
        shadowTarget,
        "getLocalFlag failed to get a shadow target!",
        "ObjectGraphHandler:getLocalFlag",
        this.membrane?.logger
      );

      let protoTarget = this.getPrototypeOf(shadowTarget);
      if (!protoTarget) {
        return false;
      }
      map = this.membrane.map.get(protoTarget)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
      if (!map) {
        return false;
      }
      assert(
        map instanceof ProxyMapping,
        "map not found in getLocalFlag?",
        "ObjectGraphHandler:getLocalFlag",
        this.membrane?.logger
      );
    }
  }

  /**
   * Determine whether this proxy (or one it inherits from) requires local property deletions.
   * @param target The proxy target.
   * @returns True if deletes should be local.
   */
  private requiresDeletesBeLocal(target: object): boolean {
    var protoTarget: object | null = target;
    var map = this.membrane.map.get(protoTarget)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    const originField = map.originField;
    while (true) {
      let shouldBeLocal =
        map.getLocalFlag(this.fieldName, "requireLocalDelete") ||
        map.getLocalFlag(originField, "requireLocalDelete");
      if (shouldBeLocal) {
        return true;
      }
      let shadowTarget = map.getShadowTarget(this.fieldName);
      protoTarget = this.getPrototypeOf(shadowTarget);
      if (!protoTarget) {
        return false;
      }
      map = this.membrane.map.get(protoTarget)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    }
  }

  /**
   * Truncate the argument list, if necessary.
   * @param target The method about to be invoked.
   * @param argumentsList The list of arguments
   * @returns a copy of the list of arguments, truncated.
   */
  private truncateArguments(
    target: (...args: unknown[]) => unknown,
    argumentsList: unknown[]
  ): any[] {
    assert(
      Array.isArray(argumentsList),
      "argumentsList must be an array!",
      "ObjectGraphHandler:truncateArguments",
      this.membrane?.logger
    );
    const map = this.membrane.map.get(target)!; // ansteg TODO: I added a type assertion, but this may be masking a real bug.

    var originCount = map.getTruncateArgList(map.originField);
    if (typeof originCount === "boolean") {
      originCount = originCount ? target.length : Infinity;
    } else {
      assert(
        Number.isInteger(originCount) && originCount >= 0,
        "must call slice with a non-negative integer length",
        "ObjectGraphHandler:truncateArguments",
        this.membrane?.logger
      );
    }

    var targetCount = map.getTruncateArgList(this.fieldName);
    if (typeof targetCount === "boolean") {
      targetCount = targetCount ? target.length : Infinity;
    } else {
      assert(
        Number.isInteger(targetCount) && targetCount >= 0,
        "must call slice with a non-negative integer length",
        "ObjectGraphHandler:truncateArguments",
        this.membrane?.logger
      );
    }

    const count = Math.min(originCount, targetCount);
    return argumentsList.slice(0, count);
  }

  /**
   * Add a ProxyMapping or a Proxy.revoke function to our list.
   *
   * @private
   */
  addRevocable(revoke: ProxyMapping | (() => void)): void {
    if (this.__isDead__) {
      throwAndLog(
        "This membrane handler is dead!",
        "ObjectGraphHandler:addRevocable",
        this.membrane?.logger
      );
    }
    this.__revokeFunctions__.push(revoke);
  }

  /**
   * Remove a ProxyMapping or a Proxy.revoke function from our list.
   *
   * @private
   */
  removeRevocable(revoke: () => void): void {
    let index = this.__revokeFunctions__.indexOf(revoke);
    if (index == -1) {
      throwAndLog(
        "Unknown revoke function!",
        "ObjectGraphHandler:removeRevocable",
        this.membrane?.logger
      );
    }
    this.__revokeFunctions__.splice(index, 1);
  }

  /**
   * Revoke the entire object graph.
   */
  revokeEverything(): void {
    if (this.__isDead__) {
      throwAndLog(
        "This membrane handler is dead!",
        "ObjectGraphHandler:revokeEverything",
        this.membrane?.logger
      );
    }
    Object.defineProperty(this, "__isDead__", new DataDescriptor(true));
    let length = this.__revokeFunctions__.length;
    for (var i = 0; i < length; i++) {
      let revocable = this.__revokeFunctions__[i];
      if (revocable instanceof ProxyMapping) {
        revocable.revoke();
        // ansteg: ProxyMappings are retained by membrane.map, so we need to clear them here.
        // TODO: this is also a band-aid solution - we need to make sure that values and proxies can get garbage-collected
        // if they go out of scope (in non-membrane code) _before_ the membrane is revoked.
        revocable.selfDestruct(this.membrane);
      } // typeof revocable == "function"
      else {
        revocable();
      }
    }
    // ansteg: The ___revokeFunctions__ array contains ProxyMappings and/or revoke functions that indirectly retain shadowTargets.
    // This interacts with the ShadowKeyMap, which has shadowTargets as keys, and real targets as values, causing all the "real" values to leak.
    // Clearing these functions after revoke is part of the solution, but some references to the shadowTarget remain in membrane.map.
    // TODO: what about pre-revoke leaks? As soon as a target and all associated proxies go out of scope, they should be garbage-collectable.
    // But merely clearing this cache on revoke won't solve this problem - we'll probably need a solution similar to RevokeFnsCache or RevokerManagement
    this.__revokeFunctions__ = [];

    // ansteg: we might also want to consider breaking the reference to the membrane when the handler is revoked.
    // this.membrane = undefined;

    // ansteg: the ShadowKeyMap was creating a linkage between shadowTargets and real targets, causing the real targets to leak.
    //         The commented code below is a "heavy hammer" technique to clear the ShadowKeyMap,
    //         but it's more elegant to just prevent retainers for the shadowTargets
    //         (which allows the values of the ShadowKeyMap WeakMap to be cleaned up).
    // const areAllHandlersRevoked = Reflect.ownKeys(this.membrane.handlersByFieldName).every(fieldName => {
    //   return this.membrane.handlersByFieldName[fieldName].__isDead__;
    // });
    // if (areAllHandlersRevoked) {
    //   clearShadowKeyMap();
    // }
  }
}

Object.seal(ObjectGraphHandler.prototype);
Object.seal(ObjectGraphHandler);

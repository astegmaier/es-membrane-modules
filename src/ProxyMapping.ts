import assert from "./assert";
import { valueType, NOT_YET_DETERMINED } from "./moduleUtilities";
import { throwAndLog } from "./throwAndLog";
import type { ILogger, Membrane } from "./Membrane";

// ansteg TODO: I commented out references to DogfoodMembrane, but maybe I want to re-add it after I understand what it was trying to do?
// const DogfoodMembrane = undefined;

// ansteg TODO: clarify which of these are required v. optional
/**
 * {
 *   value: value,
 *   proxy: proxy,
 *   revoke: revoke
 *   (other properties as necessary)
 * }
 */
export interface IProxyParts {
  value: object;
  shadowTarget?: object;
  proxy?: object;
  revoke?: () => void;
  localDescriptors?: Map<symbol | string, PropertyDescriptor>;
  deletedLocals?: Set<symbol | string>;
  cachedOwnKeys?: { keys: any; original: any };
  ownKeysFilter?: (propertyName: string | symbol) => boolean;
  truncateArgList?: boolean | number;
  override?: boolean;
}

/**
 * @private
 *
 * In Production, instances of ProxyMapping must NEVER be exposed outside of the
 * membrane module!  (Neither should instances Membrane or ObjectGraphHandler,
 * but the ProxyMapping is strictly for internal use of the module.)
 */
export class ProxyMapping {
  originField: symbol | string; // ansteg TODO: can this be just 'string'?
  proxiedFields: { [fieldName: symbol | string]: IProxyParts } = {};
  originalValue: object = NOT_YET_DETERMINED;
  /**
   * @private
   *
   * Local flags determining behavior.
   */
  private localFlags?: Set<any>;
  localFlagsSymbols?: Map<any, any>;
  loggerWeakRef: WeakRef<ILogger> | undefined;

  constructor(originField: symbol | string, logger: ILogger | null) {
    this.originField = originField;
    // ansteg: to avoid leaking the logger, we are being defensive about introducing new hard references to the logger
    this.loggerWeakRef = logger ? new WeakRef(logger) : undefined;
  }
  getOriginal(): any {
    if (this.originalValue === NOT_YET_DETERMINED) {
      throwAndLog(
        "getOriginal called but the original value hasn't been set!",
        "ProxyMapping:getOriginal",
        this.loggerWeakRef?.deref()
      );
    }
    return this.getProxy(this.originField);
  }

  hasField(field: symbol | string): boolean {
    return Reflect.ownKeys(this.proxiedFields).includes(field);
  }

  getValue(field: symbol | string): any {
    var rv = this.proxiedFields[field];
    if (!rv) {
      throwAndLog(
        "getValue called for unknown field!",
        "ProxyMapping:getValue",
        this.loggerWeakRef?.deref()
      );
    }
    return rv.value;
  }

  getProxy(field: symbol | string): any {
    var rv = this.proxiedFields[field];
    if (!rv) {
      throwAndLog(
        "getProxy called for unknown field!",
        "ProxyMapping:getProxy",
        this.loggerWeakRef?.deref()
      );
    }
    return !rv.override && field === this.originField ? rv.value : rv.proxy;
  }

  hasProxy(proxy: any): boolean {
    let fields = Object.getOwnPropertyNames(this.proxiedFields);
    for (let i = 0; i < fields.length; i++) {
      if (this.getProxy(fields[i]!) === proxy) {
        return true;
      }
    }
    return false;
  }

  getShadowTarget(field: symbol | string): any {
    var rv = this.proxiedFields[field];
    if (!rv) {
      throwAndLog(
        "getShadowTarget called for unknown field!",
        "ProxyMapping:getShadowTarget",
        this.loggerWeakRef?.deref()
      );
    }
    return rv.shadowTarget;
  }

  isShadowTarget(shadowTarget: any): boolean {
    return Reflect.ownKeys(this.proxiedFields).some(function (this: ProxyMapping, field) {
      // ansteg TODO: I added a type assertion (this.proxiedFields[field]!), but this may be masking a real bug.
      return this.proxiedFields[field]!.shadowTarget === shadowTarget;
    }, this);
  }

  /**
   * Add a value to the mapping.
   *
   * @param membrane {Membrane} The owning membrane.
   * @param field    {symbol|string}   The field name of the object graph.
   * @param parts    {IProxyParts} containing:
   *   {
   *      value    {Variant}  The value to add.
   *      proxy    {Proxy}    A proxy associated with the object graph and the value.
   *      revoke   {Function} A revocation function for the proxy, if available.
   *      override {Boolean}  True if the field should be overridden.
   *   }
   */
  set(membrane: Membrane, field: symbol | string, parts: IProxyParts) {
    let override = typeof parts.override === "boolean" && parts.override;
    if (!override && this.hasField(field)) {
      throwAndLog("set called for previously defined field!", "ProxyMapping:set", membrane?.logger);
    }

    this.proxiedFields[field] = parts;

    if (override || field !== this.originField) {
      if (valueType(parts.proxy) !== "primitive") {
        // if (DogfoodMembrane && membrane !== DogfoodMembrane) {
        //   DogfoodMembrane.ProxyToMembraneMap.add(parts.proxy);
        // }
        membrane.map.set(parts.proxy, this);
      }
    } else if (this.originalValue === NOT_YET_DETERMINED) {
      this.originalValue = parts.value;
      delete parts.proxy;
      delete parts.revoke;
    }

    if (!membrane.map.has(parts.value)) {
      // if (DogfoodMembrane && membrane !== DogfoodMembrane) {
      //   DogfoodMembrane.ProxyToMembraneMap.add(parts.value);
      // }

      if (valueType(parts.value) !== "primitive") {
        membrane.map.set(parts.value, this);
      }
    } else {
      assert(
        this === membrane.map.get(parts.value),
        "ProxyMapping mismatch?",
        "ProxyMapping:set",
        membrane?.logger
      );
    }
  }

  remove(field: symbol | string): void {
    delete this.proxiedFields[field];
  }

  selfDestruct(membrane: Membrane): void {
    let fields = Object.getOwnPropertyNames(this.proxiedFields);
    for (let i = fields.length - 1; i >= 0; i--) {
      let field = fields[i]!;
      if (field !== this.originField) {
        // ansteg TODO: I added a type assertion (this.proxiedFields[field]!), but this may be masking a real bug.
        membrane.map.delete(this.proxiedFields[field]!.proxy);
      }
      // ansteg TODO: I added a type assertion (this.proxiedFields[field]!), but this may be masking a real bug.
      membrane.map.delete(this.proxiedFields[field]!.value);
      delete this.proxiedFields[field];
    }
    // ansteg: originalValue was preventing garbage collection when the proxy is revoked.
    // TODO: this is also a band-aid solution - we need to make sure that values and proxies can get garbage-collected
    // if they go out of scope (in non-membrane code) _before_ the membrane is revoked.
    // We might be able to remove originalValue completely - it doesn't seem to be read in any serious way.
    // @ts-ignore -- this is a special case where we are shutting down.
    delete this.originalValue;
  }

  revoke(): void {
    let fields = Object.getOwnPropertyNames(this.proxiedFields);
    // fields[0] === this.originField
    for (let i = 1; i < fields.length; i++) {
      // ansteg TODO: I added a type assertions here, but this may be masking a real bug.
      this.proxiedFields[fields[i]!]!.revoke!();
    }
  }

  /**
   * fieldName: {symbol|string} The object graph's field name.
   * flagName:  {string} The flag to set.
   * value:     {boolean} The value to set.
   */
  setLocalFlag(fieldName: symbol | string, flagName: string, value: boolean): void {
    if (typeof fieldName == "string") {
      if (!this.localFlags) {
        this.localFlags = new Set();
      }

      let flag = flagName + ":" + fieldName;
      if (value) {
        this.localFlags.add(flag);
      } else {
        this.localFlags.delete(flag);
      }
    } else if (typeof fieldName == "symbol") {
      // It's harder to combine symbols and strings into a string...
      if (!this.localFlagsSymbols) {
        this.localFlagsSymbols = new Map();
      }
      let obj = this.localFlagsSymbols.get(fieldName) || {};
      obj[flagName] = value;
      this.localFlagsSymbols.set(fieldName, obj);
    } else {
      throwAndLog(
        "fieldName is neither a symbol nor a string!",
        "ProxyMapping:setLocalFlag",
        this.loggerWeakRef?.deref()
      );
    }
  }

  /**
   * fieldName: {symbol|string} The object graph's field name.
   * flagName:  {string} The flag to set.
   *
   * @returns {boolean} The value to set.
   */
  getLocalFlag(fieldName: symbol | string, flagName: string): boolean {
    if (typeof fieldName == "string") {
      if (!this.localFlags) {
        return false;
      }
      let flag = flagName + ":" + fieldName;
      return this.localFlags.has(flag);
    } else if (typeof fieldName == "symbol") {
      if (!this.localFlagsSymbols) {
        return false;
      }
      let obj = this.localFlagsSymbols.get(fieldName);
      if (!obj || !obj[flagName]) {
        return false;
      }
      return true;
    } else {
      throwAndLog(
        "fieldName is neither a symbol nor a string!",
        "ProxyMapping:getLocalFlag",
        this.loggerWeakRef?.deref()
      );
    }
  }

  getLocalDescriptor(
    fieldName: symbol | string,
    propName: symbol | string
  ): PropertyDescriptor | undefined {
    let desc: PropertyDescriptor | undefined;
    let metadata = this.proxiedFields[fieldName];
    if (metadata?.localDescriptors) {
      desc = metadata.localDescriptors.get(propName);
    }
    return desc;
  }

  setLocalDescriptor(
    fieldName: symbol | string,
    propName: symbol | string,
    desc: PropertyDescriptor
  ): true {
    this.unmaskDeletion(fieldName, propName);
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    let metadata = this.proxiedFields[fieldName]!;

    if (!metadata.localDescriptors) {
      metadata.localDescriptors = new Map();
    }

    metadata.localDescriptors.set(propName, desc);
    return true;
  }

  deleteLocalDescriptor(
    fieldName: symbol | string,
    propName: symbol | string,
    recordLocalDelete: boolean
  ): void {
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    let metadata = this.proxiedFields[fieldName]!;
    if (recordLocalDelete) {
      if (!metadata.deletedLocals) {
        metadata.deletedLocals = new Set();
      }
      metadata.deletedLocals.add(propName);
    } else {
      this.unmaskDeletion(fieldName, propName);
    }

    if ("localDescriptors" in metadata) {
      metadata.localDescriptors.delete(propName);
      if (metadata.localDescriptors.size === 0) {
        delete metadata.localDescriptors;
      }
    }
  }

  cachedOwnKeys(fieldName: symbol | string): any {
    if (!this.hasField(fieldName)) {
      return null;
    }
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    let metadata = this.proxiedFields[fieldName]!;
    if ("cachedOwnKeys" in metadata) {
      return metadata.cachedOwnKeys;
    }
    return null;
  }

  setCachedOwnKeys(fieldName: symbol | string, keys: (symbol | string)[], original: any): void {
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    this.proxiedFields[fieldName]!.cachedOwnKeys = {
      keys: keys,
      original: original
    };
  }

  localOwnKeys(fieldName: symbol | string): (symbol | string)[] {
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    let metadata = this.proxiedFields[fieldName]!,
      rv: (symbol | string)[] = [];
    if ("localDescriptors" in metadata) {
      rv = Array.from(metadata.localDescriptors.keys());
    }
    return rv;
  }

  appendDeletedNames(fieldName: symbol | string, set: Set<symbol | string>): void {
    if (!this.hasField(fieldName)) {
      return;
    }
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    var locals = this.proxiedFields[fieldName]!.deletedLocals;
    if (!locals || !locals.size) {
      return;
    }
    var iter = locals.values(),
      next;
    do {
      next = iter.next();
      if (!next.done) {
        set.add(next.value);
      }
    } while (!next.done);
  }

  wasDeletedLocally(fieldName: symbol | string, propName: symbol | string): boolean {
    if (!this.hasField(fieldName)) {
      return false;
    }
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    var locals = this.proxiedFields[fieldName]!.deletedLocals;
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    return Boolean(locals) && locals!.has(propName);
  }

  unmaskDeletion(fieldName: symbol | string, propName: symbol | string): void {
    if (!this.hasField(fieldName)) {
      return;
    }
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    var metadata = this.proxiedFields[fieldName]!;
    if (!metadata.deletedLocals) {
      return;
    }
    metadata.deletedLocals.delete(propName);
    if (metadata.deletedLocals.size === 0) {
      delete metadata.deletedLocals;
    }
  }

  getOwnKeysFilter(
    fieldName: symbol | string
  ): ((propertyName: string | symbol) => boolean) | null {
    if (!this.hasField(fieldName)) {
      return null;
    }
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    var metadata = this.proxiedFields[fieldName]!;
    return typeof metadata.ownKeysFilter == "function" ? metadata.ownKeysFilter : null;
  }

  setOwnKeysFilter(
    fieldName: symbol | string,
    filter: (propertyName: string | symbol) => boolean
  ): void {
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    this.proxiedFields[fieldName]!.ownKeysFilter = filter;
  }

  getTruncateArgList(fieldName: symbol | string): boolean | number {
    if (!this.hasField(fieldName)) {
      return false;
    }
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    var metadata = this.proxiedFields[fieldName]!;
    return typeof metadata.truncateArgList !== "undefined" ? metadata.truncateArgList : false;
  }

  setTruncateArgList(fieldName: symbol | string, value: boolean | number): void {
    // ansteg TODO: I added a type assertion, but this may be masking a real bug.
    this.proxiedFields[fieldName]!.truncateArgList = value;
  }
}

Object.seal(ProxyMapping.prototype);
Object.seal(ProxyMapping);

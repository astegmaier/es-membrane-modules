import type { IProxyParts, Membrane } from "./Membrane";

export interface IProxyMappingOwn {
  originField: any;
  proxiedFields: any;
  originalValue: any;
  localFlags?: Set<any>;
  localFlagsSymbols?: Map<any, any>;
}

export interface IProxyMappingPrototype {
  getOriginal(this: ProxyMapping): any;
  hasField(this: ProxyMapping, field: any): boolean;
  getValue(this: ProxyMapping, field: any): any;
  getProxy(this: ProxyMapping, field: any): any;
  hasProxy(this: ProxyMapping, field: any): boolean;
  getShadowTarget(this: ProxyMapping, field: any): any;
  isShadowTarget(this: ProxyMapping, shadowTarget: any): boolean;
  /**
   * Add a value to the mapping.
   *
   * @param membrane {Membrane} The owning membrane.
   * @param field    {Symbol|String}   The field name of the object graph.
   * @param parts    {Object} containing:
   *   @param value    {Variant}  The value to add.
   *   @param proxy    {Proxy}    A proxy associated with the object graph and
   *                              the value.
   *   @param revoke   {Function} A revocation function for the proxy, if
   *                              available.
   *   @param override {Boolean}  True if the field should be overridden.
   */
  set(this: ProxyMapping, membrane: Membrane, field: string | symbol, parts: IProxyParts): void;
  remove(this: ProxyMapping, field: any): void;
  selfDestruct(this: ProxyMapping, membrane: Membrane): void;
  revoke(this: ProxyMapping): void;
  /**
   * @param fieldName: {Symbol|String} The object graph's field name.
   * @param flagName:  {String} The flag to set.
   * @param value:     {Boolean} The value to set.
   */
  setLocalFlag(
    this: ProxyMapping, 
    fieldName: Symbol | string,
    flagName: string,
    value: boolean
  ): void;
  /**
   * fieldName: {Symbol|String} The object graph's field name.
   * flagName:  {String} The flag to set.
   *
   * @returns {Boolean} The value to set.
   */
  getLocalFlag(this: ProxyMapping, fieldName: Symbol | string, flagName: string): boolean;
  getLocalDescriptor(this: ProxyMapping, fieldName: any, propName: any): PropertyDescriptor | undefined;
  setLocalDescriptor(
    this: ProxyMapping, 
    fieldName: any,
    propName: any,
    desc: PropertyDecorator
  ): void;
  deleteLocalDescriptor(
    this: ProxyMapping, 
    fieldName: any,
    propName: any,
    recordLocalDelete: any
  ): void;
  cachedOwnKeys(this: ProxyMapping, fieldName: any): any;
  setCachedOwnKeys(this: ProxyMapping, fieldName, keys, original): void;
  localOwnKeys(this: ProxyMapping, fieldName): any;
  appendDeletedNames(this: ProxyMapping, fieldName: any, set: any): void;
  wasDeletedLocally(this: ProxyMapping, fieldName: any, propName: any): boolean;
  unmaskDeletion(this: ProxyMapping, fieldName: any, propName: any): void;
  getOwnKeysFilter(this: ProxyMapping, fieldName: any): any;
  setOwnKeysFilter(this: ProxyMapping, fieldName: any, filter: any): void;
  getTruncateArgList(this: ProxyMapping, fieldName: any): any;
  setTruncateArgList(this: ProxyMapping, fieldName: any, value: any): void;
}

export interface ProxyMapping extends IProxyMappingOwn, IProxyMappingPrototype { }

export class ProxyMapping {
  constructor(originField: any);
}

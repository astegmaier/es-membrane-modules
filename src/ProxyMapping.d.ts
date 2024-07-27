import type { IProxyParts, Membrane } from "./Membrane";

export interface IProxyMappingOwn {
  originField: symbol | string;
  proxiedFields: any;
  originalValue: object;
  localFlags?: Set<any>;
  localFlagsSymbols?: Map<any, any>;
}

export interface IProxyMappingPrototype {
  getOriginal(this: ProxyMapping): any;
  hasField(this: ProxyMapping, field: symbol | string): boolean;
  getValue(this: ProxyMapping, field: symbol | string): any;
  getProxy(this: ProxyMapping, field: symbol | string): any;
  hasProxy(this: ProxyMapping, field: symbol | string): boolean;
  getShadowTarget(this: ProxyMapping, field: symbol | string): any;
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
  getLocalFlag(this: ProxyMapping, fieldName: symbol | string, flagName: string): boolean;
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
  cachedOwnKeys(this: ProxyMapping, fieldName: symbol | string): any;
  setCachedOwnKeys(this: ProxyMapping, fieldName: symbol | string, keys, original): void;
  localOwnKeys(this: ProxyMapping, fieldName: symbol | string): any;
  appendDeletedNames(this: ProxyMapping, fieldName: symbol | string, set: any): void;
  wasDeletedLocally(this: ProxyMapping, fieldName: symbol | string, propName: any): boolean;
  unmaskDeletion(this: ProxyMapping, fieldName: symbol | string, propName: any): void;
  getOwnKeysFilter(this: ProxyMapping, fieldName: symbol | string): any;
  setOwnKeysFilter(this: ProxyMapping, fieldName: symbol | string, filter: any): void;
  getTruncateArgList(this: ProxyMapping, fieldName: symbol | string): any;
  setTruncateArgList(this: ProxyMapping, fieldName: symbol | string, value: any): void;
}

export interface ProxyMapping extends IProxyMappingOwn, IProxyMappingPrototype { }

export class ProxyMapping {
  constructor(originField: any);
}

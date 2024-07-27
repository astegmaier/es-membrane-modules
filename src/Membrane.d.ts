import { ModifyRulesAPI } from "./ModifyRulesAPI";
import { allTraps, Primordials } from "./sharedUtilities";
import { Constants } from "./moduleUtilities";
import { ProxyMapping } from "./ProxyMapping";
import { ObjectGraphHandler } from "./ObjectGraphHandler";

interface MembraneOptions {
  passThroughFilter?: (value: unknown) => boolean;
  showGraphName?: boolean;
  logger?: any;
}

export interface IProxyParts extends ReturnType<typeof Proxy.revocable> {
  value: any;
  override: boolean;
  shadowTarget?: any;
}

export interface IBuildMappingOptions {
  /** A mapping with associated values and proxies. */
  mapping?: ProxyMapping;
  originHandler?: any
  override?: boolean;
}

export interface IGetHandlerByNameOptions {
  /** True if we must create a missing graph handler. */
  mustCreate?: boolean;
}

export interface IMembraneOwn {
  showGraphName: boolean;
  /*
   * key: ProxyMapping instance
   * key may be a Proxy, a value associated with a proxy, or an original value.
   */
  map: WeakMap<any, ProxyMapping>;
  handlersByFieldName: { [fieldName: string | symbol]: any };
  logger: any;
  __functionListeners__: any[];
  warnOnceSet: Set<any> | null;
  modifyRules: ModifyRulesAPI;
  passThroughFilter: (value: unknown) => boolean;
  Primordials: typeof Primordials;
}

export interface IMembranePrototype {
  allTraps: typeof allTraps;

  /**
   * Returns true if we have a proxy for the value.
   */
  hasProxyForValue(this: Membrane, field: symbol | string, value: any): boolean;

  /**
   * Get the value associated with a field name and another known value.
   *
   * @param field {symbol|string}  The field to look for.
   * @param value {any} The key for the ProxyMapping map.
   *
   * @returns [
   *    {Boolean} True if the value was found.
   *    {any} The value for that field.
   * ]
   *
   * @note This method is not used internally in the membrane, but only by debug
   * code to assert that we have the right values stored.  Therefore you really
   * shouldn't use it in Production.
   */
  getMembraneValue(
    this: Membrane,
    field: symbol | string,
    value: any
  ): [found: boolean, value: any];

  /**
   * Get the proxy associated with a field name and another known value.
   *
   * @param field {symbol|string}  The field to look for.
   * @param value {any} The key for the ProxyMapping map.
   *
   * @returns {[found: boolean, value: any]} -
   * [
   *    {Boolean} True if the value was found.
   *    {Proxy}   The proxy for that field.
   * ] if field is not the value's origin field
   *
   * [
   *    {Boolean} True if the value was found.
   *    {any} The actual value
   * ] if field is the value's origin field
   *
   * [
   *    {Boolean} False if the value was not found.
   *    {Object}  NOT_YET_DETERMINED
   * ]
   */
  getMembraneProxy(
    this: Membrane,
    field: symbol | string,
    value: any
  ): [found: boolean, value: any];

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
    this: Membrane,
    handler: ObjectGraphHandler,
    value: any,
    options?: IBuildMappingOptions
  ): ProxyMapping;

  hasHandlerByField(this: Membrane, field: symbol | string): boolean;

  /**
   * Get an ObjectGraphHandler object by field name.  Build it if necessary.
   *
   * @param field      {symbol|string}  The field name for the object graph.
   * @param options    {IGetHandlerByNameOptions} Broken down as follows:
   * - mustCreate {Boolean} True if we must create a missing graph handler.
   *
   * @returns {ObjectGraphHandler} The handler for the object graph.
   */
  getHandlerByName(
    this: Membrane,
    field: symbol | string,
    options?: IGetHandlerByNameOptions
  ): ObjectGraphHandler;

  /**
   * Determine if the handler is a ObjectGraphHandler for this object graph.
   *
   * @returns {Boolean} True if the handler is one we own.
   */
  ownsHandler(this: Membrane, handler: ObjectGraphHandler): boolean;

  /**
   * Wrap a value for the first time in an object graph.
   *
   * @param mapping {ProxyMapping}  A mapping whose origin field refers to the
   *                                value's object graph.
   * @param arg     {any}       The value to wrap.
   *
   * @note This marks the value as the "original" in the new ProxyMapping it
   * creates.
   */
  wrapArgumentByProxyMapping(
    this: Membrane,
    mapping: ProxyMapping,
    arg: any,
    options?: IBuildMappingOptions
  ): any;

  passThroughFilter: (value: unknown) => boolean;

  /**
   * Ensure an argument is properly wrapped in a proxy.
   *
   * @param origin {ObjectGraphHandler} Where the argument originated from
   * @param target {ObjectGraphHandler} The object graph we're returning the arg to.
   * @param arg    {any}         The argument.
   *
   * @returns {any}   
   *    - The proxy for that field - if field is not the value's origin field.
   *    - The actual value - if field is the value's origin field.
   * 
   * @throws {Error} if failed (this really should never happen)
   */
  convertArgumentToProxy(
    this: Membrane,
    originHandler: ObjectGraphHandler,
    targetHandler: ObjectGraphHandler,
    arg: any,
    options?: IBuildMappingOptions
  ): any;

  /**
   * Link two values together across object graphs.
   *
   * @param handler0 {ObjectGraphHandler} The graph handler that should own value0.
   * @param value0   {Object}             The first value to store.
   * @param handler1 {ObjectGraphHandler} The graph handler that should own value1.
   * @param value1   {any}            The second value to store.
   */
  bindValuesByHandlers(
    this: Membrane,
    handler0: ObjectGraphHandler,
    value0: any,
    handler1: ObjectGraphHandler,
    value1: any
  ): void;

  /**
   * Wrap the methods of a descriptor in an object graph.
   *
   * @private This method should NOT be exposed to the public.
   */
  wrapDescriptor(
    this: Membrane,
    originField: symbol | string,
    targetField: symbol | string,
    desc: PropertyDescriptor
  ): PropertyDescriptor;

  /**
   * Add a listener for function entry, return and throw operations.
   *
   * @param listener {Function} The listener to add.
   *
   * @see ObjectGraphHandler.prototype.notifyFunctionListeners for what each
   * listener will get for its arguments.
   */
  addFunctionListener(this: Membrane, listener: (...args: any[]) => any): void;

  /**
   * Add a listener for function entry, return and throw operations.
   *
   * @param listener {Function} The listener to remove.
   */
  removeFunctionListener(
    this: Membrane,
    listener: (...args: any[]) => any
  ): void;

  /**
   * A flag indicating if internal properties of the Membrane are private.
   *
   * @public
   */
  secured: boolean;

  __mayLog__: () => boolean;

  warnOnce(this: Membrane, message: string): void;

  readonly constants: typeof Constants;
}

export interface Membrane extends IMembraneOwn, IMembranePrototype {}

export class Membrane {
  constructor(options?: MembraneOptions);
}

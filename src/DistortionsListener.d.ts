import { Membrane } from "./Membrane";

export interface IDistortionsListenerOwn {
  membrane: Membrane;
  /* object or function.prototype: JSON configuration */
  valueAndProtoMap: Map<any, any>;
  /* function: JSON configuration */
  instanceMap: Map<any, any>;
  /* function returning boolean: JSON configuration */
  filterToConfigMap: Map<any, any>;
  ignorableValues: Set<any>;
}

export interface IDistortionsListenerConfig {
  formatVersion: string;
  dataVersion: string;
  filterOwnKeys: boolean;
  proxyTraps: any[];
  storeUnknownAsLocal: boolean;
  requireLocalDelete: boolean;
  useShadowTarget: boolean;
  truncateArgList: boolean;
}

export interface IDistortionsListenerPrototype {
  addListener(this: DistortionsListener, value: any, category: any, config: any): void;
  removeListener(this: DistortionsListener, value: any, category: any): void;
  listenOnce(this: DistortionsListener, meta: any, config: any): void;
  sampleConfig(this: DistortionsListener, isFunction: boolean): IDistortionsListenerConfig;
  bindToHandler(this: DistortionsListener, handler: any): void;
  ignorePrimordials(this: DistortionsListener): void;
  /**
   * @private
   */
  getConfigurationForListener(this: DistortionsListener, meta: any): any;
  applyConfiguration(this: DistortionsListener, config: any, meta: any): void;
  /**
   * @private
   */
  proxyListener(this: DistortionsListener, meta: any): void;
  passThroughFilter(this: DistortionsListener, value: any): boolean;
}

export interface DistortionsListener
  extends IDistortionsListenerOwn,
    IDistortionsListenerPrototype {}

export class DistortionsListener {
  constructor(membrane: Membrane);
}

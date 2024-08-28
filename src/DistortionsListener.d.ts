import { Membrane } from "./Membrane";
import { OwnKeysFilter } from "./ModifyRulesAPI";

export interface IDistortionsListenerOwn {
  membrane: Membrane;
  /* object or function.prototype: JSON configuration */
  valueAndProtoMap: Map<any, any>;
  /* function: JSON configuration */
  instanceMap: Map<any, any>;
  /* function returning boolean: JSON configuration */
  filterToConfigMap: Map<DistortionListenerFilter, IDistortionsListenerConfig>;
  ignorableValues: Set<any>;
}

export interface IDistortionsListenerConfig {
  formatVersion: string;
  dataVersion: string;
  filterOwnKeys: boolean | OwnKeysFilter;
  proxyTraps: any[];
  storeUnknownAsLocal: boolean;
  requireLocalDelete: boolean;
  useShadowTarget: boolean;
  truncateArgList: boolean;
}

export type DistortionListenerCategory = "prototype" | "instance" | "value" | "iterable" | "filter";

export type DistortionListenerFilter = (value: any) => boolean;

export type DistortionsListenerValue =
  | { [key: string | symbol]: any }
  | ((meta: any) => boolean)
  | ArrayLike<unknown>;

export interface IDistortionsListenerPrototype {
  addListener(
    this: DistortionsListener,
    value: DistortionsListenerValue,
    category: DistortionListenerCategory,
    config: IDistortionsListenerConfig
  ): void;
  removeListener(this: DistortionsListener, value: any, category: any): void;
  listenOnce(this: DistortionsListener, meta: any, config: any): void;
  sampleConfig(this: DistortionsListener, isFunction?: boolean): IDistortionsListenerConfig;
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

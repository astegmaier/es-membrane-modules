import { NWNCDataDescriptor, allTraps, Primordials } from "./sharedUtilities";
import { throwAndLog } from "./throwAndLog";
import type { Membrane } from "./Membrane";
import type { OwnKeysFilter } from "./ModifyRulesAPI";

export interface IDistortionsListenerConfig {
  formatVersion: string;
  dataVersion: string;
  filterOwnKeys: boolean | OwnKeysFilter;
  proxyTraps: any[];
  storeUnknownAsLocal: boolean;
  requireLocalDelete: boolean;
  useShadowTarget: boolean;
  truncateArgList?: boolean;
}

export type DistortionListenerCategory = "prototype" | "instance" | "value" | "iterable" | "filter";

export type DistortionListenerFilter = (value: any) => boolean;

export type DistortionsListenerValue =
  | { [key: string | symbol]: any }
  | ((meta: any) => boolean)
  | ArrayLike<unknown>;

export class DistortionsListener {
  membrane!: Membrane;

  /* object or function.prototype: JSON configuration */
  valueAndProtoMap!: Map<any, any>;

  /* function: JSON configuration */
  instanceMap!: Map<any, any>;

  /* function returning boolean: JSON configuration */
  filterToConfigMap!: Map<DistortionListenerFilter, IDistortionsListenerConfig>;

  ignorableValues!: Set<any>;

  constructor(membrane: Membrane) {
    Object.defineProperties(this, {
      "membrane": new NWNCDataDescriptor(membrane, false),
      "proxyListener": new NWNCDataDescriptor(this.proxyListener.bind(this), false),
      "valueAndProtoMap": new NWNCDataDescriptor(new Map(), false),
      "instanceMap": new NWNCDataDescriptor(new Map(), false),
      "filterToConfigMap": new NWNCDataDescriptor(new Map(), false),
      "ignorableValues": new NWNCDataDescriptor(new Set(), false)
    });
  }

  addListener(
    value: DistortionsListenerValue,
    category: DistortionListenerCategory,
    config: IDistortionsListenerConfig
  ): void {
    if (category === "prototype" || category === "instance") {
      value = (value as any).prototype;
    }

    if (category === "prototype" || category === "value") {
      this.valueAndProtoMap.set(value, config);
    } else if (category === "iterable") {
      Array.from(value as ArrayLike<unknown>).forEach((item) =>
        this.valueAndProtoMap.set(item, config)
      );
    } else if (category === "instance") {
      this.instanceMap.set(value, config);
    } else if (category === "filter" && typeof value === "function") {
      this.filterToConfigMap.set(value as DistortionListenerFilter, config);
    } else {
      throwAndLog(
        `Unsupported category ${category} for value`,
        "DistortionsListener:addListener",
        this.membrane?.logger
      );
    }
  }

  removeListener(value: any, category: DistortionListenerCategory): void {
    if (category === "prototype" || category === "instance") {
      value = value.prototype;
    }

    if (category === "prototype" || category === "value") {
      this.valueAndProtoMap.delete(value);
    } else if (category === "iterable") {
      Array.from(value).forEach((item) => this.valueAndProtoMap.delete(item));
    } else if (category === "instance") {
      this.instanceMap.delete(value);
    } else if (category === "filter" && typeof value === "function") {
      this.filterToConfigMap.delete(value);
    } else {
      throwAndLog(
        `Unsupported category ${category} for value`,
        "DistortionsListener:removeListener",
        this.membrane?.logger
      );
    }
  }

  listenOnce(meta: any, config: any): void {
    this.addListener(meta.target, "value", config);
    try {
      this.proxyListener(meta);
    } finally {
      this.removeListener(meta.target, "value");
    }
  }

  sampleConfig(isFunction?: boolean): IDistortionsListenerConfig {
    const rv: IDistortionsListenerConfig = {
      formatVersion: "0.8.2",
      dataVersion: "0.1",

      filterOwnKeys: false,
      proxyTraps: allTraps.slice(0),
      storeUnknownAsLocal: false,
      requireLocalDelete: false,
      useShadowTarget: false
    };

    if (isFunction) {
      rv.truncateArgList = false;
    }
    return rv;
  }

  bindToHandler(handler: any): void {
    if (!this.membrane.ownsHandler(handler)) {
      throwAndLog(
        "Membrane must own the first argument as an object graph handler!",
        "DistortionsListener:bindToHandler",
        this.membrane?.logger
      );
    }
    handler.addProxyListener(this.proxyListener);

    if (handler.mayReplacePassThrough) {
      handler.passThroughFilter = this.passThroughFilter.bind(this);
    }
  }

  ignorePrimordials(): void {
    Primordials.forEach(function (this: DistortionsListener, p) {
      if (p) {
        this.ignorableValues.add(p);
      }
    }, this);
  }

  private getConfigurationForListener(meta: any): any {
    let config = this.valueAndProtoMap.get(meta.target);
    if (!config) {
      let proto = Reflect.getPrototypeOf(meta.target);
      config = this.instanceMap.get(proto);
    }

    if (!config) {
      let iter, filter;
      iter = this.filterToConfigMap.entries();
      let entry = iter.next();
      while (!entry.done && !meta.stopped) {
        filter = entry.value[0];
        if (filter(meta)) {
          config = entry.value[1];
          break;
        } else {
          entry = iter.next();
        }
      }
    }

    return config;
  }

  applyConfiguration(config: any, meta: any): void {
    const rules = this.membrane.modifyRules;
    const fieldName = meta.handler.fieldName;
    const modifyTarget = meta.isOriginGraph ? meta.target : meta.proxy;
    if (Array.isArray(config.filterOwnKeys)) {
      const filterOptions = {
        // empty, but preserved on separate lines for git blame
      } as { originHandler?: unknown; targetHandler?: unknown };
      if (meta.originHandler) {
        filterOptions.originHandler = meta.originHandler;
      }
      if (meta.targetHandler) {
        filterOptions.targetHandler = meta.targetHandler;
      }
      rules.filterOwnKeys(fieldName, modifyTarget, config.filterOwnKeys, filterOptions);
    }

    if (!meta.isOriginGraph && !Reflect.isExtensible(meta.target)) {
      Reflect.preventExtensions(meta.proxy);
    }

    const deadTraps = allTraps.filter(function (key) {
      return !config.proxyTraps.includes(key);
    });
    rules.disableTraps(fieldName, modifyTarget, deadTraps);

    if (config.storeUnknownAsLocal) {
      rules.storeUnknownAsLocal(fieldName, modifyTarget);
    }

    if (config.requireLocalDelete) {
      rules.requireLocalDelete(fieldName, modifyTarget);
    }

    if ("truncateArgList" in config && config.truncateArgList !== false) {
      rules.truncateArgList(fieldName, modifyTarget, config.truncateArgList);
    }
  }

  // TODO: should be enumerable: false, or maybe #private?
  private proxyListener(meta: any): void {
    const config = this.getConfigurationForListener(meta);
    this.applyConfiguration(config, meta);

    meta.stopIteration();
  }

  // TODO: should be enumerable: false, or maybe #private?
  private passThroughFilter(value: any): boolean {
    return this.ignorableValues.has(value);
  }
}

Object.freeze(DistortionsListener.prototype);

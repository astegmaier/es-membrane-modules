export function returnTrue(): true {
  return true;
}
export function returnFalse(): false {
  return false;
}

export function NOT_IMPLEMENTED(): never {
  throw new Error("Not implemented!");
}

export class DataDescriptor<T = any> {
  constructor(
    public value: T,
    public writable = false,
    public enumerable = true,
    public configurable = true
  ) {}
}

export type DataDescriptorsOf<T> = {
  [P in keyof T]: DataDescriptor<T[P]>;
};

export class AccessorDescriptor<
  Getter extends () => any = any,
  Setter extends (v: any) => void = any
> {
  constructor(
    getter: Getter,
    setter?: Setter,
    public enumerable = true,
    public configurable = true
  ) {
    this.get = getter;
    if (setter) {
      this.set = setter;
    }
  }
  public get: Getter;
  public set?: Setter;
}

export class NWNCDataDescriptor<T = any> {
  constructor(
    public value: T,
    public enumerable = true
  ) {}
  writable?: false;
  configurable?: false;
}
NWNCDataDescriptor.prototype.writable = false;
NWNCDataDescriptor.prototype.configurable = false;
Object.freeze(NWNCDataDescriptor.prototype);

export type NWNCDataDescriptorsOf<T> = {
  [P in keyof T]: NWNCDataDescriptor<T[P]>;
};

export const NOT_IMPLEMENTED_DESC = new AccessorDescriptor(NOT_IMPLEMENTED, NOT_IMPLEMENTED);

export function isDataDescriptor(desc: any): desc is DataDescriptor<any> {
  if (typeof desc === "undefined") {
    return false;
  }
  if (!("value" in desc) && !("writable" in desc)) {
    return false;
  }
  return true;
}

export function isAccessorDescriptor(desc: any): desc is AccessorDescriptor<any, any> {
  if (typeof desc === "undefined") {
    return false;
  }
  if (!("get" in desc) && !("set" in desc)) {
    return false;
  }
  return true;
}

export function isGenericDescriptor(desc: any): boolean {
  if (typeof desc === "undefined") {
    return false;
  }
  return !isAccessorDescriptor(desc) && !isDataDescriptor(desc);
}

export const allTraps = Object.freeze([
  "getPrototypeOf",
  "setPrototypeOf",
  "isExtensible",
  "preventExtensions",
  "getOwnPropertyDescriptor",
  "defineProperty",
  "has",
  "get",
  "set",
  "deleteProperty",
  "ownKeys",
  "apply",
  "construct"
] as const);

type ValuesOfTuple<T extends { [n: number]: unknown }> = T[number];

export type Trap = ValuesOfTuple<typeof allTraps>;

/* XXX ajvincent This is supposed to be a complete list of top-level globals.
   Copied from https://github.com/tc39/proposal-realms/blob/master/shim/src/stdlib.js
   on September 20, 2017.
*/
export const Primordials: ReadonlyArray<
  | typeof Array
  | typeof ArrayBuffer
  | typeof Boolean
  | typeof DataView
  | typeof Date
  | typeof decodeURI
  | typeof decodeURIComponent
  | typeof encodeURI
  | typeof encodeURIComponent
  | typeof Error
  | typeof eval
  | typeof EvalError
  | typeof Float32Array
  | typeof Float64Array
  | typeof Function
  | typeof Int8Array
  | typeof Int16Array
  | typeof Int32Array
  | typeof isFinite
  | typeof isNaN
  | typeof JSON
  | typeof Map
  | typeof Math
  | typeof Number
  | typeof Object
  | typeof parseFloat
  | typeof parseInt
  | typeof Promise
  | typeof Proxy
  | typeof RangeError
  | typeof ReferenceError
  | typeof Reflect
  | typeof RegExp
  | typeof Set
  | typeof String
  | typeof Symbol
  | typeof SyntaxError
  | typeof TypeError
  | typeof Uint8Array
  | typeof Uint8ClampedArray
  | typeof Uint16Array
  | typeof Uint32Array
  | typeof URIError
  | typeof WeakMap
  | typeof WeakSet
> = Object.freeze(
  (function () {
    const p = [
      Array,
      ArrayBuffer,
      Boolean,
      DataView,
      Date,
      decodeURI,
      decodeURIComponent,
      encodeURI,
      encodeURIComponent,
      Error,
      eval,
      EvalError,
      Float32Array,
      Float64Array,
      Function,
      Int8Array,
      Int16Array,
      Int32Array,
      isFinite,
      isNaN,
      JSON,
      Map,
      Math,
      Number,
      Object,
      parseFloat,
      parseInt,
      Promise,
      Proxy,
      RangeError,
      ReferenceError,
      Reflect,
      RegExp,
      Set,
      String,
      Symbol,
      SyntaxError,
      TypeError,
      Uint8Array,
      Uint8ClampedArray,
      Uint16Array,
      Uint32Array,
      URIError,
      WeakMap,
      WeakSet
    ];

    return p.concat(
      p
        .filter((i: any) => {
          if (!i.name) {
            return false;
          }
          let j = i.name[0];
          return j.toUpperCase() === j;
        })
        .map((k: any) => k.prototype)
    );
  })()
);

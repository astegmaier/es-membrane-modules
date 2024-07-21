export function returnTrue(): true;

export function returnFalse(): false;

export function NOT_IMPLEMENTED(): never;

export class DataDescriptor<T = any> {
  constructor(
    value: T,
    writable?: boolean,
    enumerable?: boolean,
    configurable?: boolean
  );
  public value: T;
  public writable: boolean;
  public enumerable: boolean;
  public configurable: boolean;
}

export type DataDescriptorsOf<T> = {
  [P in keyof T]: DataDescriptor<T[P]>;
};

export class AccessorDescriptor<
  Getter extends () => any = any,
  Setter extends (v: any) => void = any
> {
  constructor(
    get: Getter,
    set?: Setter,
    enumerable?: boolean,
    configurable?: boolean
  );
  public get: Getter;
  public set?: Setter;
  public enumerable: boolean;
  public configurable: boolean;
}

export class NWNCDataDescriptor<T = any> {
  constructor(value: T, enumerable?: boolean);
  public value: T;
  public enumerable: boolean;
  writable: false;
  configurable: false;
}

export type NWNCDataDescriptorsOf<T> = {
  [P in keyof T]: NWNCDataDescriptor<T[P]>;
};

export const NOT_IMPLEMENTED_DESC: AccessorDescriptor<
  typeof NOT_IMPLEMENTED,
  typeof NOT_IMPLEMENTED
>;

export function isDataDescriptor(desc: any): desc is DataDescriptor<any>;

export function isAccessorDescriptor(
  desc: any
): desc is AccessorDescriptor<any, any>;

export function isGenericDescriptor(desc): boolean;

export const allTraps: ReadonlyArray<string>;

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
>;

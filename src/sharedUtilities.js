export function returnTrue() {
  return true;
}
export function returnFalse() {
  return false;
}

export function NOT_IMPLEMENTED() {
  throw new Error("Not implemented!");
}

export function DataDescriptor(value, writable = false, enumerable = true, configurable = true) {
  this.value = value;
  this.writable = writable;
  this.enumerable = enumerable;
  this.configurable = configurable;
}

export function AccessorDescriptor(getter, setter, enumerable = true, configurable = true) {
  this.get = getter;
  this.set = setter;
  this.enumerable = enumerable;
  this.configurable = configurable;
}

export function NWNCDataDescriptor(value, enumerable = true) {
  this.value = value;
  this.enumerable = enumerable;
}
NWNCDataDescriptor.prototype.writable = false;
NWNCDataDescriptor.prototype.configurable = false;
Object.freeze(NWNCDataDescriptor.prototype);

export const NOT_IMPLEMENTED_DESC = new AccessorDescriptor(NOT_IMPLEMENTED, NOT_IMPLEMENTED);

export function isDataDescriptor(desc) {
  if (typeof desc === "undefined") return false;
  if (!("value" in desc) && !("writable" in desc)) return false;
  return true;
}

export function isAccessorDescriptor(desc) {
  if (typeof desc === "undefined") {
    return false;
  }
  if (!("get" in desc) && !("set" in desc)) return false;
  return true;
}

export function isGenericDescriptor(desc) {
  if (typeof desc === "undefined") return false;
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
  "construct",
]);

/* XXX ajvincent This is supposed to be a complete list of top-level globals.
   Copied from https://github.com/tc39/proposal-realms/blob/master/shim/src/stdlib.js
   on September 20, 2017.
*/
export const Primordials = Object.freeze(
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
      WeakSet,
    ];

    return p.concat(
      p
        .filter((/** @type {any} */ i) => {
          if (!i.name) return false;
          let j = i.name[0];
          return j.toUpperCase() === j;
        })
        .map((/** @type {any} */ k) => k.prototype),
    );
  })(),
);

import { DataDescriptor } from "./sharedUtilities.js";
import { throwAndLog } from "./throwAndLog";
import type { ILogger, Membrane } from "./Membrane";
import type { IProxyParts } from "./ProxyMapping";

export function valueType(value: unknown): "function" | "object" | "primitive" {
  if (value === null) {
    return "primitive";
  }
  const type = typeof value;
  if (type != "function" && type != "object") {
    return "primitive";
  }
  return type;
}

export var ShadowKeyMap = new WeakMap<object, any>();

/**
 * Define a shadow target, so we can manipulate the proxy independently of the
 * original target.
 *
 * @argument value {object} The original target.
 * @argument codeLocation {String} A string to identify the location of the error.
 * @argument logger {ILogger | undefined} a logger to use in case of errors.
 *
 * @returns {object} A shadow target to minimally emulate the real one.
 * @private
 */
export function makeShadowTarget(
  value: object,
  codeLocation: string,
  logger: ILogger | undefined
): object {
  var rv;
  if (Array.isArray(value)) {
    rv = [];
  } else if (typeof value == "object") {
    rv = {};
  } else if (typeof value == "function") {
    rv = function () {};
  } else {
    throwAndLog("Unknown value for makeShadowTarget", codeLocation, logger);
  }
  ShadowKeyMap.set(rv, value);
  return rv;
}

export function getRealTarget(target: object): any {
  return ShadowKeyMap.has(target) ? ShadowKeyMap.get(target) : target;
}

export function stringifyArg(arg: unknown): string {
  if (arg === null) {
    return "null";
  }
  if (arg === undefined) {
    return "undefined";
  }
  if (Array.isArray(arg)) {
    return "[" + arg.map(stringifyArg).join(", ") + "]";
  }

  let type = valueType(arg);
  if (type == "primitive") {
    return arg.toString();
  }
  if (type == "function") {
    return "()";
  }
  return "{}";
}

/**
 * @deprecated
 */
export function inGraphHandler<T>(_trapName: any, callback: T): T {
  return callback;
  /* This seemed like a good idea at the time.  I wanted to know
     when the membrane was executing internal code or not.  But practically
     speaking, it's useless...

  return function() {
    if (this.__isDead__)
      throw new Error("This membrane handler is dead!");
    var msg;

    let mayLog = this.membrane.__mayLog__();

    this.membrane.handlerStack.unshift(trapName);
    if (mayLog) {
      msg = trapName + "(";
      for (let i = 0; i < arguments.length; i++) {
        let arg = arguments[i];
        msg += stringifyArg(arg) + ", ";
      }
      if (arguments.length)
        msg = msg.substr(0, msg.length - 2);
      msg += ")";

      this.membrane.logger.info(
        msg + " inGraphHandler++"
      );
    }

    var rv;
    try {
      rv = callback.apply(this, arguments);
    }

    // We might have a catch block here to wrap exceptions crossing the membrane.

    finally {
      this.membrane.handlerStack.shift();
      if (mayLog) {
        msg += " returned " + stringifyArg(rv);
        this.membrane.logger.info(
          msg + " inGraphHandler--"
        );
      }
    }

    return rv;
  };
  //*/
}

export const NOT_YET_DETERMINED = {} as { not_yet_determined: true };
Object.defineProperty(NOT_YET_DETERMINED, "not_yet_determined", new DataDescriptor(true));

export function makeRevokeDeleteRefs(parts: IProxyParts, mapping: any, field: any): any {
  let oldRevoke = parts.revoke;
  if (!oldRevoke) {
    return;
  }

  // necessary: in OverriddenProxyParts, revoke is inherited and read-only.
  Reflect.defineProperty(
    parts,
    "revoke",
    new DataDescriptor(function () {
      oldRevoke.apply(parts);
      mapping.remove(field);
    }, true)
  );
}

/**
 * Helper function to determine if anyone may log.
 * @private
 *
 * @returns {boolean} True if logging is permitted.
 */
// This function is here because I can blacklist moduleUtilities during debugging.
export function MembraneMayLog(this: Membrane): boolean {
  return typeof this.logger == "object" && Boolean(this.logger);
}

export function AssertIsPropertyKey(
  propName: string | symbol,
  codeLocation: string,
  logger: ILogger | undefined
): propName is string | symbol {
  var type = typeof propName;
  if (type != "string" && type != "symbol") {
    throwAndLog("propName is not a symbol or a string!", codeLocation, logger);
  }
  return true;
}

export const Constants = {
  warnings: {
    FILTERED_KEYS_WITHOUT_LOCAL:
      "Filtering own keys without allowing local property defines or deletes is dangerous",
    PROTOTYPE_FILTER_MISSING:
      "Proxy filter specified to inherit from prototype, but prototype provides no filter"
  }
};

Object.freeze(Constants.warnings);
Object.freeze(Constants);

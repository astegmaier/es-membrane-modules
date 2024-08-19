import { ILogger } from "./Membrane";
import { IProxyParts } from "./ProxyMapping";

export function valueType(value: any): "function" | "object" | "primitive";

export var ShadowKeyMap: WeakMap<any, any>;

/**
 * Define a shadow target, so we can manipulate the proxy independently of the
 * original target.
 *
 * @argument value {Object} The original target.
 * @param codeLocation The location in the code where the error was thrown. Separate method names with a colon (e.g. ClassName:methodName).
 * @argument logger {ILogger | undefined} a logger to use in case of errors.
 *
 * @returns {Object} A shadow target to minimally emulate the real one.
 * @private
 */
export function makeShadowTarget(
  value: any,
  codeLocation: string,
  logger: ILogger | undefined
): any;

export function getRealTarget(target: any): any;

export function stringifyArg(arg: any): string;

/**
 * @deprecated
 */
export function inGraphHandler<T>(trapName: any, callback: T): T;

export const NOT_YET_DETERMINED: { not_yet_determined: true };

export function makeRevokeDeleteRefs(parts: IProxyParts, mapping: any, field: any): any;

/**
 * Helper function to determine if anyone may log.
 * @private
 *
 * @returns {Boolean} True if logging is permitted.
 */
export function MembraneMayLog(): boolean;

export function AssertIsPropertyKey(
  propName: string | symbol,
  codeLocation: string,
  logger: ILogger | undefined
): propName is string | symbol;

export const Constants: {
  warnings: {
    FILTERED_KEYS_WITHOUT_LOCAL: string;
    PROTOTYPE_FILTER_MISSING: string;
  };
};

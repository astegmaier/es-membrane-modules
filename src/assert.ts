import { ILogger } from "./Membrane";
import { throwAndLog } from "./throwAndLog";

/**
 * Throws an error with the given message if the value is not truthy, and logs the error before throwing.
 * @param value The input that is checked for being truthy.
 * @param message The message used for the error, if thrown.
 * @param codeLocation The location in the code where the error was thrown. Separate method names with a colon (e.g. ClassName:methodName).
 * @param logger The logger that will be used to log the exception, if thrown.
 */
export function assert(
  value: unknown,
  message: string,
  codeLocation: string,
  logger: ILogger | undefined | null
): asserts value {
  if (!value) {
    throwAndLog(message, codeLocation, logger);
  }
}

import { ILogger } from "./Membrane";
import { throwAndLog } from "./throwAndLog";

/**
 * Throws an error with the given message if the value is not truthy.
 * @param value The input that is checked for being truthy.
 * @param message The message used for the error, if thrown.
 * @param logger The logger that will be used to log the exception, if thrown.
 */
export default function assert(
  value: unknown,
  message: string,
  logger: ILogger | undefined
): asserts value {
  if (!value) {
    throwAndLog(message, logger);
  }
}

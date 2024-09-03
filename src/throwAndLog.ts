import { ILogger } from "./Membrane";
/**
 * Logs an error, then throws it.
 * @param message The message used for the error.
 * @param codeLocation The location in the code where the error was thrown. Separate method names with a colon (e.g. ClassName:methodName).
 * @param logger The logger that will be used to log the exception.
 */
export function throwAndLog(
  message: string,
  codeLocation: string,
  logger: ILogger | undefined | null
): never {
  const error = new Error(message);
  logger?.error(message, codeLocation, error);
  throw error;
}

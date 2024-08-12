import { ILogger } from "./Membrane";

export function throwAndLog(message: string, logger: ILogger | undefined): never {
  const error = new Error(message);
  logger?.error(error, error.stack);
  throw error;
}

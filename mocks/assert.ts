/**
 * Throws an error with the given message if the value is not truthy.
 * @param value {unknown} The input that is checked for being truthy.
 * @param message {string} The message used for the error, if thrown.
 */
export function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

export type WithThisValueForMethods<T, ThisValue> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (this: ThisValue, ...args: A) => R : T[K];
};

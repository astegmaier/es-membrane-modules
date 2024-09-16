// The es-membrane tests were originally written for jasmine, which provides a global fail function (unlike jest).
globalThis.fail = (error) => {
  throw new Error(error);
};

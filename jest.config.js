/** @type {import('jest').Config} */
const config = {
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  globals: {
    "DogfoodMembrane": undefined, // TODO: we might have to make this a part of the code itself, not just the tests - check on this.
    fail: (error) => {throw new Error(error);}, // The es-membrane tests were originally written for jasmine, which provides a global fail function (unlike jest).
  }
};

module.exports = config;

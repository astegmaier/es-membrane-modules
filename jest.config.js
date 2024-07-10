/** @type {import('jest').Config} */
const config = {
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  globals: {
    assert: require('assert'),
    "DogfoodMembrane": undefined
  }
};

module.exports = config;

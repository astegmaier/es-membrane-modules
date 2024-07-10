/** @type {import('jest').Config} */
const config = {
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  globals: {
    "DogfoodMembrane": undefined
  }
};

module.exports = config;

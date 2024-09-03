/** @type {import('jest').Config} */
const config = {
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  setupFiles: ["./jest.setup.js"],
  // This was necessary so that @swc/jest can handle source files that do something like "import { something } from 'file.js';"
  // where file.js is actually file.ts in the source code. See: https://github.com/swc-project/jest/issues/64#issuecomment-1029753225
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};

module.exports = config;
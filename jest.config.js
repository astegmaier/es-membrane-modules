/** @type {import('jest').Config} */
const config = {
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  setupFiles: ["./jest.setup.js"],
};

export default config;
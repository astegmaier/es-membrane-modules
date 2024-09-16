// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config({
  ...tseslint.configs.base,
  "rules": {
    "curly": "error"
  },
  "files": ["src/**/*.ts", "mocks/**/*.ts", "test/**/*.ts"]
});

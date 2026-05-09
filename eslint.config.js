const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    files: ["src/**/*.ts"],
    extends: tseslint.configs.recommended,
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    ignores: ["lib/", "node_modules/"],
  }
);

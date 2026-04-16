import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    ignores: ["dist/**", "node_modules/**", "example/**", "coverage/**"],
  },

  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",

      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],

      "@typescript-eslint/ban-ts-comment": "off",

      "@typescript-eslint/no-non-null-assertion": "off",

      "@typescript-eslint/no-empty-function": "off",

      "no-undef": "off",
    },
  },
];

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Keep readability guidance non-blocking while the codebase adopts it.
      "no-nested-ternary": "warn",
      "no-unneeded-ternary": "warn",
      "no-lonely-if": "warn",
      "no-else-return": ["warn", { allowElseIf: true }],
    },
  },
  {
    files: [
      "app/api/**/*.{js,jsx,ts,tsx}",
      "controllers/**/*.{js,jsx,ts,tsx}",
      "db/**/*.{js,jsx,ts,tsx}",
      "lib/**/*.{js,jsx,ts,tsx}",
      "services/**/*.{js,jsx,ts,tsx}",
    ],
    rules: {
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "function" },
        { blankLine: "always", prev: "function", next: "*" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

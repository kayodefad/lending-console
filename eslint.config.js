import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Money rules are enforced here, not only described in the README:
 * no parseFloat, Number(), toFixed or Math rounding anywhere in the money path.
 */
const noFloatMoney = {
  "no-restricted-globals": [
    "error",
    { name: "parseFloat", message: "Money is bigint kobo. Use parseNaira / parseKoboString." },
  ],
  "no-restricted-properties": [
    "error",
    { object: "Number", property: "parseFloat", message: "Money is bigint kobo." },
    { property: "toFixed", message: "Money is bigint kobo. Use formatKobo." },
    { object: "Math", property: "round", message: "No float rounding in the money path." },
  ],
  "no-restricted-syntax": [
    "error",
    {
      selector: "CallExpression[callee.name='Number']",
      message: "Number() turns money into a float. Keep amounts as bigint kobo.",
    },
    {
      selector: "Literal[raw=/^\\d+\\.\\d+$/]",
      message: "Float literals aren't allowed in the money path.",
    },
  ],
};

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/domain/**/*.ts", "src/features/**/*.{ts,tsx}", "src/api/**/*.ts", "src/App.tsx"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: noFloatMoney,
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
);

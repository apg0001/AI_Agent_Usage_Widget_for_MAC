import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: {
        Electron: "readonly",
        React: "readonly",
        window: "readonly",
        document: "readonly",
        HTMLFormElement: "readonly",
        HTMLElement: "readonly",
        process: "readonly",
        __dirname: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules
    }
  }
];

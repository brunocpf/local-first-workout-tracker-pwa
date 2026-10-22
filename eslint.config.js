import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

export default ts.config(
  { ignores: [".claude/", "build/", ".svelte-kit/", "node_modules/", "relay/node_modules/", "relay/.wrangler/", "playwright-report/", "test-results/"] },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    rules: {
      // Imported content is untrusted: never render it as HTML.
      "svelte/no-at-html-tags": "error",
      // `_`-prefixed names and rest siblings are intentionally unused (e.g. `const { key: _key, ...rest } = row`).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
);

import js from "@eslint/js";
import globals from "globals";
import playwright from "eslint-plugin-playwright";
import tseslint from "typescript-eslint";
export default tseslint.config({
  files: ["tests/design-group-c/**/*.{ts,tsx,mjs}", "*.group-c-*.config.ts", "tests/offlineTeardown.ts", "tests/offlineTeardown.test.mjs"],
  extends: [js.configs.recommended, ...tseslint.configs.recommended],
  languageOptions: { globals: { ...globals.nodeBuiltin, ...globals.browser } },
  plugins: { playwright },
  rules: { ...playwright.configs["flat/recommended"].rules, "playwright/no-conditional-in-test": "off", "playwright/expect-expect": "off", "playwright/prefer-web-first-assertions": "warn", "playwright/no-nth-methods": "off" },
}, {
  files: ["tests/offlineTeardown.ts"],
  // Teardown drains intercepted requests; this is not an application readiness assertion.
  rules: { "playwright/no-networkidle": "off" },
});

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "src/components/ui/**",
      "src/integrations/supabase/types.ts",
      "supabase/functions/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // === Power of 10 (LiftGo) — enforced ===
      // Tipado fuerte (regla 5/10): prohibido `any` y non-null assertion.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      // Cleanup obligatorio en useEffect (regla 3).
      "react-hooks/exhaustive-deps": "error",
      // Compilación impecable (regla 10): nada de console.log en commits.
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // === Power of 10 (LiftGo) — calibradas como warning ===
      // Micro-componentes (regla 4): 150 LOC componentes, 80 LOC hooks/funciones.
      "max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true }],
      // Flujo de control simple (regla 1).
      complexity: ["warn", 12],
    },
  },
  {
    // Tests pueden usar `any` y funciones largas.
    files: ["**/*.test.{ts,tsx}", "src/test/**", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "max-lines-per-function": "off",
    },
  },
  },
);

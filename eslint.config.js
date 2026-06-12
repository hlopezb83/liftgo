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
      "scripts/**",
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
      "@typescript-eslint/no-non-null-assertion": "off",
      "max-lines-per-function": "off",
    },
  },
  {
    // Guardrail: matemática monetaria SOLO en src/lib/domain/invoiceTotals.ts
    // (re-exportado vía invoiceHelpers.ts) o rentalCalculation.ts.
    files: [
      "src/features/quotes/components/quotes/*LineHelpers.ts",
      "src/features/invoices/hooks/invoiceForm/*.ts",
    ],
    rules: {
      "no-restricted-syntax": ["error",
        {
          selector: "BinaryExpression[operator='*']",
          message: "Aritmética monetaria prohibida fuera de src/lib/domain/invoiceTotals.ts. Usar lineItemTotal / applyDiscountToBase / saleLineTotal.",
        },
        {
          selector: "BinaryExpression[operator='/']",
          message: "Aritmética monetaria prohibida fuera de src/lib/domain/invoiceTotals.ts. Usar lineItemTotal / applyDiscountToBase / saleLineTotal.",
        },
      ],
    },
  },
  {
    // Paso 8 auditoría: las páginas y componentes no deben hablar con Supabase
    // directamente. Toda I/O debe pasar por un hook bajo features/*/hooks.
    // Excepción: src/features/auth/pages/AuthPage.tsx (login flow, pre-sesión).
    files: ["src/features/**/pages/**/*.{ts,tsx}", "src/features/**/components/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: ["src/features/auth/pages/AuthPage.tsx", "src/components/ui/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@/integrations/supabase/client",
            message: "Páginas y componentes no deben importar el cliente Supabase. Mover la I/O a un hook bajo src/features/*/hooks/.",
          },
        ],
      }],
    },
  },
);

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import reactCompiler from "eslint-plugin-react-compiler";
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
      "react-compiler": reactCompiler,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Compiler ESLint checks — activado como `warn` para análisis
      // estático (detecta mutaciones de state, refs mal usadas, hooks fuera
      // de spec) SIN necesidad de correr el compilador todavía. La activación
      // completa (babel-plugin-react-compiler + @vitejs/plugin-react) queda
      // como paso opcional siguiente; hoy sólo cosechamos los diagnósticos.
      "react-compiler/react-compiler": "warn",
      "react-refresh/only-export-components": ["warn", {
        allowConstantExport: true,
        allowExportNames: ["meta", "loader", "action", "links", "headers", "handle"],
      }],


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
  {
    // Registry de íconos: NADIE fuera de src/components/icons/** puede
    // importar de `lucide-react`. Consumir siempre `@/components/icons`
    // para poder consolidar duplicados semánticos, renombrar y auditar
    // en un solo lugar. Además, dentro del registry desincentivamos los
    // nombres crudos de lucide cuando existe un alias semántico canónico.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/icons/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "lucide-react",
            message: "Importa desde '@/components/icons' (registry). Ver src/components/icons/index.ts para aliases semánticos (DeleteIcon, EditIcon, SuccessIcon, etc.).",
          },
          {
            name: "@/components/icons",
            importNames: [
              "Trash2", "Pencil", "Plus", "FileText", "Receipt", "Truck",
              "Wrench", "CheckCircle", "CheckCircle2", "Check",
              "AlertTriangle", "XCircle", "AlertCircle", "Loader2", "Save",
              "Copy", "RefreshCw", "Download", "Upload", "Eye", "EyeOff",
              "Search", "Minus", "Undo2", "RotateCcw", "Info", "Home",
              "DollarSign", "Calendar", "Clock", "User", "Users",
              "Building2", "ShieldCheck", "Package", "History", "Phone",
              "MapPin", "Landmark", "Handshake", "Stamp", "Settings",
              "LayoutDashboard", "BarChart3", "TrendingUp", "TrendingDown",
              "Target", "Trophy", "Activity", "Star", "HelpCircle",
              "KeyRound", "ArrowLeft", "ChevronRight", "ChevronLeft",
              "ChevronUp", "ChevronDown",
              // Aliases nuevos v7.11 — bloquear nombres crudos:
              "Send", "FileSignature", "HandCoins", "Banknote", "Factory",
              "PackageSearch", "FileCheck2", "Wallet", "CalendarX",
              // v7.11.1 — nuevos aliases (RevenueIcon, FilterIcon, EmailIcon, OpenLinkIcon):
              "CircleDollarSign", "SlidersHorizontal", "Mail", "ExternalLink",
              // TruckIcon fue eliminado del uso: Truck ya cubre FleetIcon,
              // y Entregas ahora usa DeliveryIcon (Send).
              "TruckIcon",
            ],
            message: "Usa el alias semántico del registry (DeleteIcon, EditIcon, DeliveryIcon, PaymentIcon, CostIcon, SignIcon, SupplierIcon, ...). Ver JSDoc en src/components/icons/index.ts.",
          },
        ],
      }],
    },
  },

  {
    // Auditoría arquitectura — paso 2: desincentivar imports profundos
    // cross-feature. Cada feature debería exponer su API pública vía
    // `src/features/<feature>/index.ts`. Importar rutas internas de OTRA
    // feature acopla refactors internos con consumidores remotos.
    //
    // Scope acotado a hooks/ y lib/ para NO sobreescribir el guardrail
    // de Supabase definido sobre pages/components (en flat config, dos
    // bloques que coinciden y definen la misma regla, la última gana).
    //
    // Hoy lo dejamos como `warn` para no romper la build; los nuevos
    // archivos deben respetarlo y la migración es incremental.
    files: ["src/features/**/hooks/**/*.{ts,tsx}", "src/features/**/lib/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          {
            group: ["@/features/*/hooks/**", "@/features/*/components/**", "@/features/*/lib/**", "@/features/*/pages/**"],
            message: "No importes rutas internas de otra feature. Usa el barrel público @/features/<feature>.",
          },
        ],
      }],
    },
  },
  {
    // Guardrail sonner: fuera de la plataforma de feedback (`appFeedback.ts`)
    // y del Toaster de shadcn (`components/ui/sonner.tsx`), nadie puede
    // importar de `sonner`. Toda notificación debe pasar por notifySuccess/
    // notifyError/notifyInfo/notifyWarning/notifyAsync para garantizar
    // consistencia visual, reporte estructurado y un solo punto de auditoría.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/ui/appFeedback.ts",
      "src/lib/ui/__tests__/**",
      "src/components/ui/sonner.tsx",
      "**/__tests__/**",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "sonner",
            message: "Usa notifySuccess/notifyError/notifyInfo/notifyWarning/notifyAsync de @/lib/ui/appFeedback en lugar de importar `sonner` directamente.",
          },
        ],
      }],
    },
  },
);

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import reactCompiler from "eslint-plugin-react-compiler";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";


export default tseslint.config(
  {
    ignores: [
      "dist",
      "src/components/ui/**",
      "src/integrations/supabase/types.ts",
      "supabase/functions/**",
      "scripts/**",
      // Scripts locales de auditoría visual (no forman parte del bundle).
      "audit_*.ts",
      // E2E specs de Playwright (usan console.log intencionalmente para debug).
      "tests/**",
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
      "jsx-a11y": jsxA11y,
      import: importPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      // a11y calibrado como warn: no bloquea la build mientras migramos.
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      // Orden de imports consistente (autofix con `bun run lint --fix`).
      "import/order": ["warn", {
        groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
        "newlines-between": "never",
        alphabetize: { order: "asc", caseInsensitive: true },
        pathGroups: [
          { pattern: "@/**", group: "internal", position: "after" },
        ],
        pathGroupsExcludedImportTypes: ["builtin"],
      }],
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
      // Reglas nuevas de eslint-plugin-react-hooks@7 (experimentales / React
      // Compiler). Desactivadas para no bloquear la build; migración
      // incremental por lote separado. Ver plan de deps.
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/purity": "off",
      "react-hooks/static-components": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/gating": "off",
      "react-hooks/globals": "off",
      "react-hooks/config": "off",
      "react-hooks/component-hook-factories": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/unsupported-syntax": "off",
      "react-hooks/fbt": "off",
      // Compilación impecable (regla 10): nada de console.log en commits.
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // === Power of 10 (LiftGo) — calibradas como warning ===
      // Micro-componentes (regla 4): 150 LOC componentes, 80 LOC hooks/funciones.
      "max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true }],
      // Flujo de control simple (regla 1). 15 permite headroom para dialogs
      // y hooks con branching de UI ya probados.
      complexity: ["warn", 15],
    },
  },
  {
    // Tests pueden usar `any` y funciones largas.
    // Tests pueden usar `any`, funciones largas y patrón vi.mock entre imports.
    files: ["**/*.test.{ts,tsx}", "src/test/**", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "max-lines-per-function": "off",
      // vi.mock() debe ir antes de imports que dependen del módulo mockeado,
      // lo que rompe el orden alfabético estricto de import/order.
      "import/order": "off",
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
            name: "sonner",
            message: "Usa notifySuccess/notifyError/notifyInfo/notifyWarning/notifyAsync de @/lib/ui/appFeedback en lugar de importar `sonner` directamente.",
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
    // Guardrail date-fns: features/**, hooks/**, components/** deben usar los
    // helpers de `@/lib/format/dateFormats` (formatDateMty, formatDateTimeMty,
    // todayKeyMty, APP_LOCALE) o `@/lib/date/toYMD`, en lugar de importar
    // `format` desde `date-fns` o el locale `es` directamente. Así se garantiza
    // TZ America/Monterrey y locale es-MX en toda la UI.
    //
    // Nivel `warn` (no `error`) durante la migración incremental — los archivos
    // nuevos deben respetarlo; los ~30 sitios legacy con `format(...)` inline
    // se migran por lotes en cambios sucesivos.
    //
    // Excepciones legítimas (siguen pudiendo importar `date-fns` puro):
    //  - src/lib/** (los propios helpers y capa de PDFs)
    //  - src/components/ui/calendar.tsx (react-day-picker requiere el objeto locale)
    //  - src/features/calendar/** y src/features/cash-flow/** (aritmética de fechas: addDays, differenceInDays, startOfWeek, etc.)
    //  - tests
    files: ["src/features/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/**",
      "src/components/ui/calendar.tsx",
      "src/features/calendar/**",
      "src/features/cash-flow/**",
      "**/__tests__/**",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["warn", {
        paths: [
          {
            name: "date-fns",
            importNames: ["format"],
            message: "Usa formatDateMty / formatDateTimeMty / formatDateLongMty / formatDayMonthShortMty / formatDateTimeShortMty / todayKeyMty desde '@/lib/format/dateFormats', o toYMD desde '@/lib/date/toYMD'. Aplican TZ America/Monterrey y locale es-MX.",
          },
          {
            name: "date-fns/locale",
            importNames: ["es"],
            message: "Importa APP_LOCALE desde '@/lib/format/dateFormats' en lugar del locale `es` crudo.",
          },
        ],
      }],
    },
  },

  {
    // Guardrail react-router: `useNavigate` crudo se salta el envoltorio
    // `startTransition` de React 19 que aplica `useNavigateTransition`,
    // haciendo que las navegaciones a rutas lazy congelen la UI mientras
    // Suspense resuelve. Usar siempre `@/hooks/useNavigateTransition`.
    //
    // Excepciones: el propio hook, el flujo de auth (pre-sesión, sin lazy
    // chunks pesados) y tests.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/hooks/useNavigateTransition.ts",
      "src/features/auth/**",
      "**/__tests__/**",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["warn", {
        paths: [
          {
            name: "react-router-dom",
            importNames: ["useNavigate"],
            message: "Usa `useNavigateTransition` desde '@/hooks/useNavigateTransition'. Envuelve la navegación en startTransition y evita bloquear la UI cuando la ruta destino es lazy.",
          },
          {
            name: "react-router",
            importNames: ["useNavigate"],
            message: "Usa `useNavigateTransition` desde '@/hooks/useNavigateTransition'.",
          },
        ],
      }],
    },
  },

  {
    // Guardrail Tailwind: prohibido usar utilities de color crudas de la
    // paleta por defecto (bg-white, text-gray-500, border-slate-200…) fuera
    // de src/components/ui/**. Toda superficie de la app se debe pintar con
    // tokens semánticos (background, foreground, muted, primary, warning,
    // success, status-*, gantt-*, etc.) declarados en src/index.css @theme.
    //
    // Excepciones: primitives shadcn en components/ui/**, PDFs (usan estilos
    // inline de react-pdf) y tests.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/components/ui/**",
      "src/lib/pdf/**",
      "**/__tests__/**",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": ["warn",
        {
          selector: "Literal[value=/\\\\b(bg|text|border|from|to|via|ring|divide|outline|placeholder|caret|fill|stroke|shadow|decoration|accent)-(white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\\\d{2,3}\\\\b/]",
          message: "Usa un token semántico (bg-primary, text-muted-foreground, border-warning/40, bg-status-*, bg-gantt-*, …) en lugar de la paleta cruda de Tailwind. Los tokens están en src/index.css.",
        },
      ],
    },
  },
);



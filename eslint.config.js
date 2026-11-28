import js from "@eslint/js";
import { builtinRules } from "eslint/use-at-your-own-risk";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import reactCompiler from "eslint-plugin-react-compiler";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importPlugin from "eslint-plugin-import-x";
import playwright from "eslint-plugin-playwright";
import tseslint from "typescript-eslint";

// Flat config reemplaza opciones de una regla; no acumula restricciones entre
// bloques. Aliases independientes de las reglas core conservan cada ámbito,
// severidad y excepción, y permiten que todos los guardrails se ejecuten juntos.
// Los contratos de scripts/tests/eslint-guardrails.test.mjs validan la
// configuración efectiva y detectan incompatibilidades al actualizar ESLint.
const guardrails = {
  rules: {
    "no-inline-money": builtinRules.get("no-restricted-syntax"),
    "no-ui-supabase": builtinRules.get("no-restricted-imports"),
    "no-direct-ui-imports": builtinRules.get("no-restricted-imports"),
    "no-direct-sonner": builtinRules.get("no-restricted-imports"),
    "no-deep-feature-imports": builtinRules.get("no-restricted-imports"),
    "no-unlocalized-dates": builtinRules.get("no-restricted-imports"),
    "no-unwrapped-navigation": builtinRules.get("no-restricted-imports"),
    "no-raw-colors": builtinRules.get("no-restricted-syntax"),
  },
};

const UNUSED_VARS_OPTIONS = {
  argsIgnorePattern: "^_",
  varsIgnorePattern: "^_",
  caughtErrorsIgnorePattern: "^_",
  destructuredArrayIgnorePattern: "^_",
  ignoreRestSiblings: true,
};

const LEGACY_EDGE_FUNCTIONS_COMPLEXITY_BASELINE = [
  "supabase/functions/_shared/ai.ts",
  "supabase/functions/_shared/authWithDeps.ts",
  "supabase/functions/_shared/creditNoteSourceValidation.ts",
  "supabase/functions/_shared/edgeSentry.ts",
  "supabase/functions/_shared/edgeSentryError.ts",
  "supabase/functions/_shared/edgeSentryPrivacy.ts",
  "supabase/functions/_shared/facturapi/client.ts",
  "supabase/functions/_shared/facturapi/invoiceRecovery.ts",
  "supabase/functions/_shared/facturapi/retryContext.ts",
  "supabase/functions/_shared/facturapi/validateTaxId.ts",
  "supabase/functions/_shared/orgContext.ts",
  "supabase/functions/_shared/stampOutcome.ts",
  "supabase/functions/_shared/storageMigrationPlan.ts",
  "supabase/functions/_shared/storageOrphanReconciliation.ts",
  "supabase/functions/_shared/storageQuarantine.ts",
  "supabase/functions/_shared/supabaseClients.ts",
  "supabase/functions/_shared/supplierRepXmlCore.ts",
  "supabase/functions/cancel-cfdi/handler.ts",
  "supabase/functions/cancel-credit-note/handler.ts",
  "supabase/functions/cancel-payment-complement/handler.ts",
  "supabase/functions/classify-feedback-report/handler.ts",
  "supabase/functions/generate-manual/manual.ts",
  "supabase/functions/generate-recurring-invoices/coverage.ts",
  "supabase/functions/generate-recurring-invoices/handler.ts",
  "supabase/functions/generate-recurring-invoices/invoiceHistory.ts",
  "supabase/functions/generate-recurring-invoices/optimizationFixtures.ts",
  "supabase/functions/generate-recurring-invoices/performance.ts",
  "supabase/functions/generate-recurring-invoices/planner.ts",
  "supabase/functions/generate-recurring-invoices/planningData.ts",
  "supabase/functions/generate-recurring-invoices/quoteCharges.ts",
  "supabase/functions/generate-recurring-maintenance/logic.ts",
  "supabase/functions/reconcile-stamping-invoices/creditNoteProcessor.ts",
  "supabase/functions/reconcile-stamping-invoices/invoiceProcessor.ts",
  "supabase/functions/reconcile-stamping-invoices/paymentProcessor.ts",
  "supabase/functions/reconcile-stamping-invoices/recoverCreditNotePdf.ts",
  "supabase/functions/refresh-cancellation-status/handler.ts",
  "supabase/functions/validate-customers-tax-info/handler.ts",
  "supabase/functions/validate-receptor-tax-info/handler.ts",
  "supabase/functions/validate-supplier-rep/handler.ts",
];

export default tseslint.config(
  {
    ignores: [
      "dist",
      // Artefactos de pruebas y cobertura; no son código del proyecto.
      "reports/**",
      // Salidas del build SSR de TanStack Start / nitro.
      ".output",
      ".vinxi",
      ".nitro",
      "src/integrations/supabase/types.ts",
      // Árbol de rutas generado por TanStack Router.
      "src/routeTree.gen.ts",
      // Archivos auto-generados por la plataforma. No se editan manualmente.
      "src/integrations/supabase/client.ts",
      "src/integrations/supabase/previewAuthStorage.ts",
      "src/integrations/supabase/client.server.ts",
      "src/integrations/supabase/auth-middleware.ts",
      "src/integrations/supabase/auth-attacher.ts",
      "qa/facturapi6-sandbox-candidate/snapshot/**",
      // Código Deno de QA Facturapi 6 (copias revisadas y sondas); no es parte de la app web.
      "qa/facturapi6-sandbox-candidate/runner/**",
      "qa/facturapi6-phase1/staged/**",
      "qa/facturapi6-phase2/parity_probe.ts",
      "qa/facturapi6-phase3/adaptation/candidate/**",
      "qa/facturapi6-phase4/staged/**",
      "qa/facturapi6-phase4/rollback/**",
      "scripts/**",
      // Scripts locales de auditoría visual (no forman parte del bundle).
      "audit_*.ts",
      // tests/**, src/components/ui/** y supabase/functions/** tienen sus
      // propios bloques dedicados más abajo.
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    ignores: ["tests/**", "src/components/ui/**", "supabase/functions/**"],
    languageOptions: {
      ecmaVersion: 2022,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "react-compiler": reactCompiler,
      "jsx-a11y": jsxA11y,
      "import-x": importPlugin,
      liftgo: guardrails,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "import-x/order": ["warn", {
        groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
        "newlines-between": "never",
        alphabetize: { order: "asc", caseInsensitive: true },
        pathGroups: [
          { pattern: "@/**", group: "internal", position: "after" },
        ],
        pathGroupsExcludedImportTypes: ["builtin"],
      }],
      "react-compiler/react-compiler": "warn",
      "react-refresh/only-export-components": ["warn", {
        allowConstantExport: true,
        allowExportNames: ["meta", "loader", "action", "links", "headers", "handle"],
      }],
      "@typescript-eslint/no-unused-vars": ["error", UNUSED_VARS_OPTIONS],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/gating": "warn",
      "react-hooks/globals": "off",
      "react-hooks/config": "off",
      "react-hooks/component-hook-factories": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/unsupported-syntax": "off",
      "react-hooks/fbt": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true }],
      complexity: ["warn", 15],
    },
  },
  {
    // Bloque acotado de seguridad, accesibilidad e íconos sobre primitivas UI.
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/components/ui/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "jsx-a11y": jsxA11y,
      liftgo: guardrails,
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", UNUSED_VARS_OPTIONS],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "liftgo/no-ui-supabase": ["error", {
        paths: [
          {
            name: "@/integrations/supabase/client",
            message: "Las primitivas UI no deben importar el cliente Supabase.",
          },
        ],
      }],
    },
  },
  {
    // Los globales del navegador solo aplican al cliente, no a funciones SSR.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**", "src/server.ts", "src/**/*.server.{ts,tsx}", "src/**/*.functions.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      "src/server.ts",
      "src/**/*.server.{ts,tsx}",
      "src/**/*.functions.{ts,tsx}",
      "*.config.ts",
    ],
    languageOptions: { globals: globals.nodeBuiltin },
  },
  {
    // Tests pueden usar `any`, funciones largas y patrón vi.mock entre imports.
    files: ["**/*.test.{ts,tsx}", "src/test/**", "**/__tests__/**"],
    ignores: ["supabase/functions/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "max-lines-per-function": "off",
      "import-x/order": "off",
    },
  },
  {
    // Guardrail: matemática monetaria fuera de UI/formularios críticos.
    files: [
      "src/features/quotes/components/*LineHelpers.ts",
      "src/features/invoices/hooks/invoiceForm/*.ts",
      "src/features/accounts-payable/components/SupplierBillDetailContent.tsx",
      "src/features/accounts-payable/pages/AgingReportPage.tsx",
      "src/features/reports/components/AgingReport.tsx",
    ],
    rules: {
      "liftgo/no-inline-money": ["error",
        {
          selector: "BinaryExpression[operator='*']",
          message: "Aritmética monetaria prohibida fuera de helpers monetarios (invoiceTotals / sumMoney / money).",
        },
        {
          selector: "BinaryExpression[operator='/']",
          message: "Aritmética monetaria prohibida fuera de helpers monetarios (invoiceTotals / sumMoney / money).",
        },
      ],
    },
  },
  {
    // Las páginas y componentes no deben hablar con Supabase directamente.
    files: ["src/features/**/pages/**/*.{ts,tsx}", "src/features/**/components/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: ["src/features/auth/pages/AuthPage.tsx", "src/components/ui/**"],
    rules: {
      "liftgo/no-ui-supabase": ["error", {
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
    // Registry de íconos: consumir siempre `@/components/icons` con aliases semánticos.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/icons/**"],
    rules: {
      "liftgo/no-direct-ui-imports": ["error", {
        paths: [
          {
            name: "lucide-react",
            message: "Importa desde '@/components/icons' (registry). Ver src/components/icons/index.ts para aliases semánticos.",
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
              "Send", "FileSignature", "HandCoins", "Banknote", "Factory",
              "PackageSearch", "FileCheck2", "Wallet", "CalendarX",
              "CircleDollarSign", "SlidersHorizontal", "Mail", "ExternalLink",
              "TruckIcon",
            ],
            message: "Usa el alias semántico del registry (DeleteIcon, EditIcon, CheckIcon, DeliveryIcon, PaymentIcon, ...).",
          },
        ],
      }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/icons/**", "src/components/ui/sonner.tsx", "src/lib/ui/appFeedback.ts"],
    rules: {
      "liftgo/no-direct-sonner": ["error", {
        paths: [{
          name: "sonner",
          message: "Usa notifySuccess/notifyError/notifyInfo/notifyWarning/notifyAsync de @/lib/ui/appFeedback en lugar de importar `sonner` directamente.",
        }],
      }],
    },
  },
  {
    files: ["src/features/**/hooks/**/*.{ts,tsx}", "src/features/**/lib/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "liftgo/no-deep-feature-imports": ["warn", {
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
      "liftgo/no-unlocalized-dates": ["error", {
        paths: [
          {
            name: "date-fns",
            importNames: ["format"],
            message: "Usa formatDateMty / formatDateTimeMty / formatDateLongMty / formatDayMonthShortMty / formatDateTimeShortMty / todayKeyMty desde '@/lib/format/dateFormats', o toYMD desde '@/lib/date/toYMD'.",
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
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/hooks/useNavigateTransition.ts",
      "src/lib/router-compat.ts",
      "src/lib/router-compat-ui.tsx",
      "src/components/ui/**",
      "src/features/auth/**",
      "**/__tests__/**",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "liftgo/no-unwrapped-navigation": ["error", {
        paths: [
          {
            name: "react-router-dom",
            importNames: ["useNavigate"],
            message: "Usa `useNavigateTransition` desde '@/hooks/useNavigateTransition'.",
          },
          {
            name: "react-router",
            importNames: ["useNavigate"],
            message: "Usa `useNavigateTransition` desde '@/hooks/useNavigateTransition'.",
          },
          {
            name: "@tanstack/react-router",
            importNames: ["useNavigate", "Link"],
            message: "Usa `useNavigateTransition` desde '@/hooks/useNavigateTransition' y `Link` desde '@/lib/router-compat-ui'.",
          },
          {
            name: "@/lib/router-compat",
            importNames: ["useNavigate"],
            message: "Usa `useNavigateTransition` desde '@/hooks/useNavigateTransition'.",
          },
        ],
      }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/components/ui/**",
      "src/lib/pdf/**",
      "**/__tests__/**",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "liftgo/no-raw-colors": ["error",
        {
          selector: "Literal[value=/\\b(bg|text|border|from|to|via|ring|divide|outline|placeholder|caret|fill|stroke|shadow|decoration|accent)-(white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}\\b/]",
          message: "Usa un token semántico (bg-primary, text-muted-foreground, border-warning/40, bg-status-*, bg-gantt-*, …) en lugar de la paleta cruda de Tailwind.",
        },
      ],
    },
  },
  {
    // Bloque dedicado para Edge Functions Deno (complejidad, tamaño y tipado).
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["supabase/functions/**/*.ts"],
    ignores: [
      "supabase/functions/**/*_test.ts",
      "supabase/functions/_shared/test/**",
      "supabase/functions/_shared/test-helpers.ts",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.es2024,
        Deno: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", UNUSED_VARS_OPTIONS],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true }],
      complexity: ["error", 15],
    },
  },
  {
    // Línea base explícita para módulos legacy o fijados por hash en Fase 3/4.
    files: LEGACY_EDGE_FUNCTIONS_COMPLEXITY_BASELINE,
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-useless-assignment": "off",
      "max-lines": "off",
      "max-lines-per-function": "off",
      complexity: "off",
    },
  },
  {
    files: ["tests/inventory-design/**/*.{ts,tsx}", "tests/e2e/**/*.{ts,tsx}", "tests/multi-tenant-ab/**/*.{ts,tsx}", "tests/mobile/**/*.{ts,tsx}"],
    plugins: { playwright, "react-hooks": reactHooks },
    languageOptions: {
      parser: tseslint.parser,
      globals: globals.nodeBuiltin,
    },
    rules: {
      ...playwright.configs["flat/recommended"].rules,
      "playwright/no-wait-for-timeout": "warn",
      "playwright/no-skipped-test": "warn",
      "playwright/no-conditional-in-test": "off",
      "playwright/no-networkidle": "warn",
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    files: ["src/routes/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["src/components/filters/FiltersToolbar.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);

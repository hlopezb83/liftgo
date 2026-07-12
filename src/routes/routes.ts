/**
 * Constantes centralizadas de rutas.
 *
 * Uso:
 *   import { ROUTES } from "@/routes/routes";
 *   navigate(ROUTES.invoices.detail(id));
 *   navigate(ROUTES.bookings.list);
 *
 * ⚠️ Cualquier ruta añadida aquí DEBE existir también en `appRoutes`
 *    (src/routes/routes-config.tsx) o vivir bajo `/portal/*`.
 *    Guardrail: `src/routes/__tests__/routes.test.ts`.
 */

export const ROUTES = {
  // Generales
  dashboard: "/",
  changelog: "/changelog",
  help: "/help",

  // Operaciones
  fleet: {
    list: "/fleet",
    new: "/fleet/new",
    detail: (id: string) => `/fleet/${id}`,
    edit: (id: string) => `/fleet/${id}/edit`,
  },
  bookings: {
    list: "/bookings",
    new: "/bookings/new",
    detail: (id: string) => `/bookings/${id}`,
  },
  calendar: "/calendar",
  deliveries: {
    list: "/deliveries",
    detail: (id: string) => `/deliveries/${id}`,
  },
  returnInspections: {
    list: "/returns",
    detail: (id: string) => `/returns/${id}`,
  },
  damage: "/damage",
  maintenance: "/maintenance",
  inventory: "/inventory",

  // Comercial
  crm: {
    list: "/crm",
    cerrados: "/crm/cerrados",
  },
  customers: {
    list: "/customers",
    detail: (id: string) => `/customers/${id}`,
  },
  quotes: {
    list: "/quotes",
    new: "/quotes/new",
    detail: (id: string) => `/quotes/${id}`,
    edit: (id: string) => `/quotes/${id}/edit`,
  },
  contracts: {
    list: "/contracts",
    new: "/contracts/new",
    detail: (id: string) => `/contracts/${id}`,
    edit: (id: string) => `/contracts/${id}/edit`,
  },

  // Finanzas
  invoices: {
    list: "/invoices",
    new: "/invoices/new",
    reconciliation: "/invoices/reconciliation",
    detail: (id: string) => `/invoices/${id}`,
    edit: (id: string) => `/invoices/${id}/edit`,
  },
  expenses: "/expenses",
  cuentasPorPagar: {
    list: "/cuentas-por-pagar",
    antiguedad: "/cuentas-por-pagar/antiguedad",
  },
  flujoDeCaja: "/flujo-de-caja",
  cuentasBancarias: "/cuentas-bancarias",
  conciliacionBancaria: {
    list: "/conciliacion-bancaria",
    historial: "/conciliacion-bancaria/historial",
  },
  reports: "/reports",
  incomeStatement: "/income-statement",
  mrr: "/mrr",
  suppliers: {
    list: "/suppliers",
    detail: (id: string) => `/suppliers/${id}`,
  },

  // Administración
  activity: "/activity",
  audit: "/audit",
  users: "/users",
  rolePermissions: "/users/permissions",
  settings: {
    root: "/settings",
    company: "/settings/company",
    operations: "/settings/operations",
  },
  // Alias legacy para compatibilidad de imports existentes.
  companySettings: "/settings/company",
  operationsSetup: "/settings/operations",

  // Comunidad
  misReportes: "/mis-reportes",
  leaderboard: "/leaderboard",
  feedback: "/feedback",

  // Portal cliente
  portal: {
    login: "/portal/login",
    dashboard: "/portal",
    rentals: "/portal/rentals",
    quotes: "/portal/quotes",
    quoteDetail: (id: string) => `/portal/quotes/${id}`,
    invoices: "/portal/invoices",
    invoiceDetail: (id: string) => `/portal/invoices/${id}`,
    invoicePayment: (id: string) => `/portal/invoices/${id}/pago`,
    statement: "/portal/estado-cuenta",
    contracts: "/portal/contracts",
    misReportes: "/portal/mis-reportes",
    leaderboard: "/portal/leaderboard",
  },
} as const;

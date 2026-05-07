/**
 * Constantes centralizadas de rutas.
 *
 * Uso:
 *   import { ROUTES } from "@/lib/routes";
 *   navigate(ROUTES.invoices.detail(id));
 *   navigate(ROUTES.bookings.list);
 */

export const ROUTES = {
  // Generales
  dashboard: "/",
  auth: "/auth",
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
  crm: "/crm",
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
  },

  // Finanzas
  invoices: {
    list: "/invoices",
    new: "/invoices/new",
    detail: (id: string) => `/invoices/${id}`,
  },
  expenses: "/expenses",
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
  rolePermissions: "/role-permissions",
  companySettings: "/company-settings",
  operationsSetup: "/operations-setup",

  // Portal cliente
  portal: {
    login: "/portal/login",
    dashboard: "/portal",
    rentals: "/portal/rentals",
    invoices: "/portal/invoices",
    invoiceDetail: (id: string) => `/portal/invoices/${id}`,
    contracts: "/portal/contracts",
  },
} as const;

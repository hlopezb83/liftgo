import type { Database } from "@/integrations/supabase/types";

export type SupplierBillStatus = Database["public"]["Enums"]["supplier_bill_status"];
export type SupplierBillApprovalStatus = Database["public"]["Enums"]["supplier_bill_approval_status"];
export type ExpenseCategory = Database["public"]["Enums"]["expense_category"];

export const APPROVAL_STATUS_LABELS: Record<SupplierBillApprovalStatus, string> = {
  not_required: "No requiere",
  pending: "Por aprobar",
  approved: "Aprobada",
  rejected: "Rechazada",
};

export const APPROVAL_STATUSES: SupplierBillApprovalStatus[] = [
  "not_required",
  "pending",
  "approved",
  "rejected",
];

export const APPROVAL_ACTION_LABELS: Record<string, string> = {
  requested: "Aprobación solicitada",
  approved: "Aprobada",
  rejected: "Rechazada",
  reapproval_requested: "Reaprobación solicitada",
};

export const SUPPLIER_BILL_STATUS_LABELS: Record<SupplierBillStatus, string> = {
  draft: "Borrador",
  pending: "Pendiente",
  partial: "Parcial",
  paid: "Pagada",
  overdue: "Vencida",
  cancelled: "Cancelada",
};

export const SUPPLIER_BILL_STATUSES: SupplierBillStatus[] = [
  "draft",
  "pending",
  "partial",
  "paid",
  "overdue",
  "cancelled",
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  // Operativas (Costo de Servicio)
  costo_venta: "Costo de Venta",
  mantenimiento: "Mantenimiento de Equipo",
  refacciones: "Refacciones y Consumibles",
  combustible: "Combustible",
  transporte_logistica: "Transporte y Logística",
  seguros_equipo: "Seguros de Equipo",
  // Administrativas
  renta: "Renta",
  nomina: "Nómina",
  servicios_publicos: "Servicios Públicos",
  honorarios: "Honorarios",
  papeleria: "Papelería y Oficina",
  capacitacion: "Capacitación",
  software: "Software",
  // Comerciales
  publicidad: "Publicidad",
  comisiones_ventas: "Comisiones de Ventas",
  viajes_representacion: "Viajes y Representación",
  // Financieras
  intereses: "Intereses Financieros",
  comisiones_bancarias: "Comisiones Bancarias",
  // Otros
  depreciacion: "Depreciación",
  caja_chica: "Caja Chica",
  otro: "Otro",
};

export const EXPENSE_CATEGORY_GROUPS: { label: string; categories: ExpenseCategory[] }[] = [
  {
    label: "Operativas",
    categories: [
      "costo_venta",
      "mantenimiento",
      "refacciones",
      "combustible",
      "transporte_logistica",
      "seguros_equipo",
    ],
  },
  {
    label: "Administrativas",
    categories: [
      "renta",
      "nomina",
      "servicios_publicos",
      "honorarios",
      "papeleria",
      "capacitacion",
      "software",
    ],
  },
  {
    label: "Comerciales",
    categories: ["publicidad", "comisiones_ventas", "viajes_representacion"],
  },
  {
    label: "Financieras",
    categories: ["intereses", "comisiones_bancarias"],
  },
  {
    label: "Otros",
    categories: ["depreciacion", "caja_chica", "otro"],
  },
];

export const PAYMENT_METHODS = [
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
  { value: "cheque", label: "Cheque" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
] as const;

export const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label]),
);

export const PAYMENT_METHOD_SAT_OPTIONS = [
  { value: "PUE", label: "PUE — Pago en una sola exhibición" },
  { value: "PPD", label: "PPD — Pago en parcialidades o diferido" },
] as const;

export const CURRENCIES = ["MXN", "USD"] as const;

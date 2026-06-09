import type { Database } from "@/integrations/supabase/types";

export type SupplierBillStatus = Database["public"]["Enums"]["supplier_bill_status"];
export type ExpenseCategory = Database["public"]["Enums"]["expense_category"];

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
  renta: "Renta",
  nomina: "Nómina",
  software: "Software",
  depreciacion: "Depreciación",
  costo_venta: "Costo de Venta",
  caja_chica: "Caja Chica",
  publicidad: "Publicidad",
  otro: "Otro",
};

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

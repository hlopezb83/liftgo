import { format } from "date-fns";
import { formatCurrency } from "@/lib/formatCurrency";
import { STATUS_LABELS, FUEL_TYPE_LABELS, FUEL_LEVEL_LABELS, MAINTENANCE_WORK_STATUS_LABELS } from "@/lib/constants";
import { STAGE_LABELS, LOST_REASON_LABELS } from "@/lib/constants/crm";
import type { AuditLog } from "@/features/audit/hooks/useAuditLogs";

const CURRENCY_FIELDS = new Set([
  "deal_value", "final_amount", "total", "subtotal", "tax_amount",
  "daily_rate", "weekly_rate", "monthly_rate", "cost", "estimated_cost",
  "actual_cost", "damage_cost", "deposit_amount", "amount", "balance",
  "paid_amount", "discount", "unit_price",
]);

const DATETIME_FIELDS = new Set([
  "created_at", "updated_at", "paid_at", "issued_at", "performed_at",
  "completed_at", "signed_at", "closed_at",
]);

const DATE_ONLY_FIELDS = new Set([
  "start_date", "end_date", "due_date", "scheduled_date", "payment_date",
  "valid_until", "last_billed_date",
]);

const ENUM_LABEL_FIELDS: Record<string, Record<string, string>> = {
  stage: STAGE_LABELS,
  lost_reason: LOST_REASON_LABELS,
  status: STATUS_LABELS,
  return_status: STATUS_LABELS,
  condition: STATUS_LABELS,
  type: STATUS_LABELS,
  fuel_type: FUEL_TYPE_LABELS,
  fuel_level: FUEL_LEVEL_LABELS,
  service_type: MAINTENANCE_WORK_STATUS_LABELS,
};

function formatDateString(field: string, value: string): string | null {
  if (DATETIME_FIELDS.has(field) || /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return format(d, "dd/MM/yyyy HH:mm");
  }
  if (DATE_ONLY_FIELDS.has(field) || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return format(d, "dd/MM/yyyy");
  }
  return null;
}

function formatStringValue(field: string, value: string): string {
  if (ENUM_LABEL_FIELDS[field]?.[value]) return ENUM_LABEL_FIELDS[field][value];
  const formattedDate = formatDateString(field, value);
  if (formattedDate) return formattedDate;
  return value.length > 80 ? `${value.slice(0, 80)}…` : value;
}

export function formatAuditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";

  if (CURRENCY_FIELDS.has(field)) {
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(num)) return formatCurrency(num);
  }

  if (typeof value === "string") return formatStringValue(field, value);
  if (typeof value === "object") return "(estructura actualizada)";
  return String(value);
}

export function getRecordLabel(log: AuditLog): string {
  const data = (log.new_data || log.old_data) as Record<string, unknown> | null;
  if (!data) return log.record_id.slice(0, 8);
  const pick = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : undefined);
  const desc = pick("description");
  return pick("name") || pick("booking_number") || pick("contract_number") || pick("invoice_number") || pick("quote_number") || desc?.slice(0, 30) || log.record_id.slice(0, 8);
}

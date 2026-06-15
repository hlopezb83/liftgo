import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { nowMty } from "@/lib/utils";
import { CLOSED_STAGES, type Prospect, type ProspectRow } from "./prospectTypes";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_DAYS = 14;

interface MapOptions {
  creatorName: string | null;
}

function formatDateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "dd/MM/yyyy", { locale: es });
}

function computeStaleDays(updatedAt: string): number {
  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(updated)) return 0;
  return Math.floor((nowMty().getTime() - updated) / DAY_MS);
}

export function mapProspectRow(row: ProspectRow, opts: MapOptions): Prospect {
  const dealValue = row.deal_value ?? 0;
  const isClosed = CLOSED_STAGES.has(row.stage);
  const createdAt = row.created_at ?? "";
  const updatedAt = row.updated_at ?? createdAt;
  const staleDays = updatedAt ? computeStaleDays(updatedAt) : 0;

  return {
    id: row.id,
    companyName: row.company_name,
    contactPerson: row.contact_person,
    email: row.email,
    phone: row.phone,
    dealValue,
    dealValueLabel: formatCurrency(dealValue),
    stage: row.stage,
    stageOrder: row.stage_order ?? 0,
    notes: row.notes,
    quoteId: row.quote_id,
    customerId: row.customer_id,
    createdBy: row.created_by,
    createdByName: opts.creatorName,
    createdAt,
    createdAtLabel: formatDateLabel(createdAt) ?? "",
    updatedAt,
    staleDays,
    isStale: !isClosed && staleDays > STALE_THRESHOLD_DAYS,
    isClosed,
    closedAt: row.closed_at,
    closedAtLabel: formatDateLabel(row.closed_at),
    lostReason: row.lost_reason,
    finalAmount: row.final_amount,
  };
}

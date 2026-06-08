import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatCurrency";
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
  const staleDays = computeStaleDays(row.updated_at);

  return {
    id: row.id,
    companyName: row.company_name,
    contactPerson: row.contact_person,
    email: row.email,
    phone: row.phone,
    dealValue,
    dealValueLabel: formatCurrency(dealValue),
    stage: row.stage,
    stageOrder: row.stage_order,
    notes: row.notes,
    quoteId: row.quote_id,
    customerId: row.customer_id,
    createdBy: row.created_by,
    createdByName: opts.creatorName,
    createdAt: row.created_at,
    createdAtLabel: formatDateLabel(row.created_at) ?? "",
    updatedAt: row.updated_at,
    staleDays,
    isStale: !isClosed && staleDays > STALE_THRESHOLD_DAYS,
    isClosed,
    closedAt: row.closed_at,
    closedAtLabel: formatDateLabel(row.closed_at),
    lostReason: row.lost_reason,
    finalAmount: row.final_amount,
  };
}

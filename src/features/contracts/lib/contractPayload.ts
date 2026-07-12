import { roundMoney } from "@/lib/money";
import type { ContractFormShape } from "../hooks/contractForm/contractFormDefaults";

const nn = (v: string): string | null => v || null;
const numOrNull = (v: string | null | undefined, fallback: number | null = null): number | null => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? roundMoney(n) : fallback;
};

export function buildContractPayload(form: ContractFormShape, bookingId: string | null) {
  return {
    customer_id: form.customer_id,
    forklift_id: form.forklift_id,
    start_date: nn(form.start_date),
    end_date: nn(form.end_date),
    daily_rate: roundMoney(Number(form.daily_rate)),
    weekly_rate: roundMoney(Number(form.weekly_rate)),
    monthly_rate: roundMoney(Number(form.monthly_rate)),
    deposit_amount: roundMoney(Number(form.deposit_amount)),
    terms_text: nn(form.terms_text),
    signed_by: nn(form.signed_by),
    notes: nn(form.notes),
    booking_id: bookingId || null,
    status: "draft",
    signed_at: null as string | null,
    usage_location: nn(form.usage_location),
    max_hours_per_month: numOrNull(form.max_hours_per_month),
    extra_hour_rate: numOrNull(form.extra_hour_rate),
    payment_frequency: form.payment_frequency || "Mensual",
    late_interest_rate: numOrNull(form.late_interest_rate, 5),
    contract_city: form.contract_city || "San Pedro Garza García, N.L.",
    witness_1: nn(form.witness_1),
    witness_2: nn(form.witness_2),
  };
}

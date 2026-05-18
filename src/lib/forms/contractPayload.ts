import type { ContractFormShape } from "@/features/contracts/hooks/contractForm/contractFormDefaults";

export function buildContractPayload(form: ContractFormShape, bookingId: string | null) {
  return {
    customer_id: form.customer_id,
    forklift_id: form.forklift_id,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    daily_rate: Number(form.daily_rate),
    weekly_rate: Number(form.weekly_rate),
    monthly_rate: Number(form.monthly_rate),
    deposit_amount: Number(form.deposit_amount),
    terms_text: form.terms_text || null,
    signed_by: form.signed_by || null,
    notes: form.notes || null,
    booking_id: bookingId || null,
    status: "draft",
    signed_at: null,
    usage_location: form.usage_location || null,
    max_hours_per_month: form.max_hours_per_month ? Number(form.max_hours_per_month) : null,
    extra_hour_rate: form.extra_hour_rate ? Number(form.extra_hour_rate) : null,
    payment_frequency: form.payment_frequency || "Mensual",
    late_interest_rate: form.late_interest_rate ? Number(form.late_interest_rate) : 5,
    contract_city: form.contract_city || "San Pedro Garza García, N.L.",
    witness_1: form.witness_1 || null,
    witness_2: form.witness_2 || null,
  };
}

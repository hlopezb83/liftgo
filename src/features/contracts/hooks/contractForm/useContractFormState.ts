import { useEffect, useState } from "react";
import { defaultContractForm, type ContractFormShape } from "./contractFormDefaults";
import type { Database } from "@/integrations/supabase/types";
import { toStr, toNumStr } from "@/lib/coerce";

type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];

function mapContractToForm(c: ContractRow): ContractFormShape {
  return {
    customer_id: toStr(c.customer_id),
    forklift_id: toStr(c.forklift_id),
    start_date: toStr(c.start_date),
    end_date: toStr(c.end_date),
    daily_rate: toNumStr(c.daily_rate, "0"),
    weekly_rate: toNumStr(c.weekly_rate, "0"),
    monthly_rate: toNumStr(c.monthly_rate, "0"),
    deposit_amount: toNumStr(c.deposit_amount, "0"),
    terms_text: toStr(c.terms_text),
    signed_by: toStr(c.signed_by),
    notes: toStr(c.notes),
    usage_location: toStr(c.usage_location),
    max_hours_per_month: toNumStr(c.max_hours_per_month),
    extra_hour_rate: toNumStr(c.extra_hour_rate),
    payment_frequency: toStr(c.payment_frequency, "Mensual"),
    late_interest_rate: toNumStr(c.late_interest_rate, "5"),
    contract_city: toStr(c.contract_city, "San Pedro Garza García, N.L."),
    witness_1: toStr(c.witness_1),
    witness_2: toStr(c.witness_2),
  };
}

export function useContractFormState(existing: ContractRow | null | undefined, isEdit: boolean) {
  const [form, setForm] = useState<ContractFormShape>(defaultContractForm);
  const [templateApplied, setTemplateApplied] = useState(false);

  useEffect(() => {
    if (existing && isEdit) {
      setForm(mapContractToForm(existing));
      setTemplateApplied(true);
    }
  }, [existing, isEdit]);

  const updateField = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return { form, setForm, updateField, templateApplied, setTemplateApplied };
}

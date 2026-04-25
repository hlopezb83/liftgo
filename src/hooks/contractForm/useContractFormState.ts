import { useEffect, useState } from "react";
import { defaultContractForm, type ContractFormShape } from "./contractFormDefaults";
import type { Database } from "@/integrations/supabase/types";

type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];

export function useContractFormState(existing: ContractRow | null | undefined, isEdit: boolean) {
  const [form, setForm] = useState<ContractFormShape>(defaultContractForm);
  const [templateApplied, setTemplateApplied] = useState(false);

  useEffect(() => {
    if (existing && isEdit) {
      setForm({
        customer_id: existing.customer_id || "",
        forklift_id: existing.forklift_id || "",
        start_date: existing.start_date || "",
        end_date: existing.end_date || "",
        daily_rate: String(existing.daily_rate || 0),
        weekly_rate: String(existing.weekly_rate || 0),
        monthly_rate: String(existing.monthly_rate || 0),
        deposit_amount: String(existing.deposit_amount || 0),
        terms_text: existing.terms_text || "",
        signed_by: existing.signed_by || "",
        notes: existing.notes || "",
        usage_location: existing.usage_location || "",
        max_hours_per_month: String(existing.max_hours_per_month || ""),
        extra_hour_rate: String(existing.extra_hour_rate || ""),
        payment_frequency: existing.payment_frequency || "Mensual",
        late_interest_rate: String(existing.late_interest_rate || 5),
        contract_city: existing.contract_city || "San Pedro Garza García, N.L.",
        witness_1: existing.witness_1 || "",
        witness_2: existing.witness_2 || "",
      });
      setTemplateApplied(true);
    }
  }, [existing, isEdit]);

  const updateField = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return { form, setForm, updateField, templateApplied, setTemplateApplied };
}

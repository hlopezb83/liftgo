import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { Database } from "@/integrations/supabase/types";
import { toStr, toNumStr } from "@/lib/coerce";
import { zodResolver } from "@/lib/forms/zodResolver";
import { contractFormSchema, type ContractFormValues } from "../../lib/contractFormSchema";
import { defaultContractForm } from "./contractFormDefaults";

type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];

function mapContractToForm(c: ContractRow): ContractFormValues {
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

/**
 * UX-M1: RHF + Zod. Retorna la instancia `form` para wiring con `<FormField>` y
 * `useUnsavedChangesGuard(formState.isDirty)`.
 */
export function useContractFormState(existing: ContractRow | null | undefined, isEdit: boolean) {
  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: defaultContractForm,
    mode: "onBlur",
  });
  const [templateApplied, setTemplateApplied] = useState(false);

  // Hidrata el form cuando llega el contrato existente (edición).
  const [prevExistingId, setPrevExistingId] = useState<string | null>(null);
  const nextExistingId = existing?.id ?? null;
  useEffect(() => {
    if (existing && isEdit && prevExistingId !== nextExistingId) {
      setPrevExistingId(nextExistingId);
      form.reset(mapContractToForm(existing));
      setTemplateApplied(true);
    }
  }, [existing, isEdit, prevExistingId, nextExistingId, form]);

  return { form, templateApplied, setTemplateApplied };
}

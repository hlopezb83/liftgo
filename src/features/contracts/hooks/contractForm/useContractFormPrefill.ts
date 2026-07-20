import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useBookings } from "@/features/bookings";
import { useCompanySettings } from "@/features/company-settings";
import type { Database } from "@/integrations/supabase/types";
import { replacePlaceholders } from "@/lib/domain/templateUtils";
import type { ContractFormValues } from "../../lib/contractFormSchema";
import { useDefaultContractTemplate } from "../useContractTemplates";
import { buildTemplateReplacements } from "./contractTemplateReplacements";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Forklift = Database["public"]["Tables"]["forklifts"]["Row"];

interface Args {
  isEdit: boolean;
  bookingId: string | null;
  form: UseFormReturn<ContractFormValues>;
  customers?: Customer[];
  forklifts?: Forklift[];
  templateApplied: boolean;
  setTemplateApplied: (v: boolean) => void;
}

/**
 * UX-M1: prefill migrado a RHF (`form.setValue` en lugar de `setForm`).
 * Se observa `customer_id`/`forklift_id` con `watch` para reaccionar sin re-renders innecesarios.
 */
export function useContractFormPrefill({
  isEdit, bookingId, form, customers, forklifts, templateApplied, setTemplateApplied,
}: Args) {
  const { data: bookings } = useBookings();
  const { data: company } = useCompanySettings();
  const { data: template } = useDefaultContractTemplate();

  const customerId = form.watch("customer_id");
  const forkliftId = form.watch("forklift_id");

  // Pre-fill desde booking (crear nuevo desde reserva).
  useEffect(() => {
    if (isEdit || !bookingId || !bookings || !forklifts) return;
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;
    const forklift = forklifts.find((f) => f.id === booking.forklift_id);
    const opts = { shouldDirty: false } as const;
    if (booking.customer_id) form.setValue("customer_id", booking.customer_id, opts);
    form.setValue("forklift_id", booking.forklift_id, opts);
    if (booking.start_date) form.setValue("start_date", booking.start_date, opts);
    if (booking.end_date) form.setValue("end_date", booking.end_date, opts);
    form.setValue("daily_rate", String(forklift?.daily_rate || 0), opts);
    form.setValue("weekly_rate", String(forklift?.weekly_rate || 0), opts);
    form.setValue("monthly_rate", String(forklift?.monthly_rate || 0), opts);
  }, [bookingId, bookings, forklifts, isEdit, form]);

  // Auto-fill tarifas al elegir equipo (sin booking).
  useEffect(() => {
    if (isEdit || bookingId || !forkliftId || !forklifts) return;
    const forklift = forklifts.find((f) => f.id === forkliftId);
    if (!forklift) return;
    const opts = { shouldDirty: false } as const;
    form.setValue("daily_rate", String(forklift.daily_rate || 0), opts);
    form.setValue("weekly_rate", String(forklift.weekly_rate || 0), opts);
    form.setValue("monthly_rate", String(forklift.monthly_rate || 0), opts);
  }, [forkliftId, forklifts, isEdit, bookingId, form]);

  // Auto-fill template al tener cliente + equipo.
  useEffect(() => {
    if (isEdit || templateApplied || !template?.body_text) return;
    if (!customerId || !forkliftId) return;
    const customer = customers?.find((c) => c.id === customerId);
    const forklift = forklifts?.find((f) => f.id === forkliftId);
    if (!customer || !forklift) return;
    const currentForm = form.getValues();
    const text = replacePlaceholders(
      template.body_text,
      buildTemplateReplacements({ company, customer, forklift, form: currentForm }),
      "bracket",
    );
    form.setValue("terms_text", text, { shouldDirty: false });
    setTemplateApplied(true);
  }, [isEdit, templateApplied, template, customerId, forkliftId, customers, forklifts, company, form, setTemplateApplied]);
}

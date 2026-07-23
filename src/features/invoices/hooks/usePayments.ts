import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { invoiceKeys, paymentKeys } from "../lib/queryKeys";

export type Payment = Tables<"payments">;

export const paymentQueries = defineEntityQueries<"payments", Payment[], never>("payments", {
  list: (filter) => async () => {
    const invoiceId = filter?.invoiceId as string | undefined;
    let q = supabase
      .from("payments")
      .select("*")
      .order("payment_date", { ascending: false });
    if (invoiceId) q = q.eq("invoice_id", invoiceId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
});

export function usePayments(invoiceId: string | undefined) {
  return useQuery({
    ...paymentQueries.list({ invoiceId: invoiceId ?? null }),
    enabled: !!invoiceId,
  });
}

// R-arq DIFF 2: el status de la factura lo recalcula el trigger
// `sync_invoice_status_from_payments_trg` en la misma transacción del
// INSERT/UPDATE/DELETE de `payments` (con SELECT ... FOR UPDATE y misma
// guarda cancelled/draft). Eliminado el SELECT→UPDATE cliente que
// generaba una race entre dos sesiones y podía pisar el resultado del trigger.
export function useCreatePayment() {
  return useEntityMutation({
    mutationFn: async (payment: TablesInsert<"payments">) => {
      const { data, error } = await supabase
        .from("payments")
        .insert(payment)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [paymentKeys.all, invoiceKeys.all],
    errorTitle: "Error al registrar pago",
  });
}

export function useUpdatePayment() {
  return useEntityMutation({
    mutationFn: async ({ id, ...fields }: { id: string; invoice_id: string } & Partial<Omit<Payment, "id" | "created_at" | "invoice_id">>) => {
      const { data, error } = await supabase
        .from("payments")
        .update(fields)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [paymentKeys.all, invoiceKeys.all],
    errorTitle: "Error al actualizar pago",
  });
}

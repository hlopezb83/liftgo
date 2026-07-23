import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { portalQueries } from "../../lib/queryKeys";

export interface PaymentIntentInput {
  invoice_id: string;
  customer_id: string;
  amount: number;
  transfer_date: string;
  sender_bank: string | null;
  sender_last4: string | null;
  tracking_key: string | null;
  proof_file: File | null;
}

async function uploadProof(input: PaymentIntentInput): Promise<string | null> {
  if (!input.proof_file) return null;
  const ext = input.proof_file.name.split(".").pop() ?? "bin";
  const path = `${input.customer_id}/${input.invoice_id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("payment-proofs")
    .upload(path, input.proof_file, { upsert: false });
  if (error) throw error;
  return path;
}

export function useCreatePaymentIntent() {
  return useEntityMutation({
    mutationFn: async (input: PaymentIntentInput) => {
      const proofUrl = await uploadProof(input);
      const { error } = await supabase.from("customer_payment_intents").insert({
        invoice_id: input.invoice_id,
        customer_id: input.customer_id,
        amount: input.amount,
        transfer_date: input.transfer_date,
        sender_bank: input.sender_bank,
        sender_last4: input.sender_last4,
        tracking_key: input.tracking_key,
        proof_url: proofUrl,
      });
      if (error) throw error;
    },
    invalidateKeys: [portalQueries.paymentIntents.keys.all],
    successMsg: "Reporte de pago enviado. Lo revisaremos a la brevedad.",
    errorTitle: "Error al enviar reporte de pago",
  });
}

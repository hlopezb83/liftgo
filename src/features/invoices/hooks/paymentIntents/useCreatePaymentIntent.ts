import { paymentIntentsQueries } from "@/features/invoices/lib/paymentIntentsQueryKeys";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

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

// Fix 5.3: la extensión se deriva del MIME validado por el schema (whitelist),
// nunca del nombre del archivo — evita subir un `.html` renombrado a `.pdf`.
const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function uploadProof(input: PaymentIntentInput): Promise<string | null> {
  if (!input.proof_file) return null;
  const ext = MIME_TO_EXT[input.proof_file.type];
  if (!ext) throw new Error("Formato de comprobante no permitido");
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
      if (error) {
        // Fix 5.3: si el insert falla después de subir el comprobante, no
        // dejar el archivo huérfano en el storage.
        if (proofUrl) {
          await supabase.storage.from("payment-proofs").remove([proofUrl]);
        }
        throw error;
      }
    },
    invalidateKeys: [paymentIntentsQueries.keys.all],
    successMsg: "Reporte de pago enviado. Lo revisaremos a la brevedad.",
    errorTitle: "Error al enviar reporte de pago",
  });
}

import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

const BUCKET = "supplier-payment-receipts";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export interface UploadedReceipt {
  path: string;
}

export function useUploadSupplierReceipt() {
  return useEntityMutation({
    mutationFn: async ({ file, billId }: { file: File; billId: string }): Promise<UploadedReceipt> => {
      if (file.size > MAX_BYTES) throw new Error("El archivo excede 5 MB");
      if (!ACCEPTED.includes(file.type)) throw new Error("Formato no permitido (PDF, JPG, PNG, WEBP)");
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${billId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;
      // N-9: sólo se persiste el `path`; la firma se hace on-demand con TTL
      // corto en el punto de lectura (openStoredFile).
      return { path };
    },
    errorTitle: "No se pudo subir el comprobante",
  });
}

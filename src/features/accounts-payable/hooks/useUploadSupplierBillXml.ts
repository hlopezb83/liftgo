import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

const BUCKET = "supplier-bill-cfdi-xml";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (un XML CFDI rara vez supera 100 KB)

export interface UploadedCfdiXml {
  path: string;
}

export function useUploadSupplierBillXml() {
  return useEntityMutation({
    mutationFn: async ({
      file,
      uuid,
    }: { file: File; uuid: string | null }): Promise<UploadedCfdiXml> => {
      if (file.size > MAX_BYTES) throw new Error("El XML excede 2 MB");
      const folder = uuid ?? "sin-uuid";
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${folder}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: "application/xml",
        upsert: false,
      });
      if (upErr) throw upErr;
      // N-9: sólo se persiste el `path`; la firma se hace on-demand con TTL
      // corto en el punto de lectura (openStoredFile).
      return { path };
    },
    errorTitle: "No se pudo subir el XML",
  });
}

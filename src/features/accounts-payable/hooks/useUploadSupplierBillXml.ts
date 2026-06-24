import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/lib/ui/appFeedback";

const BUCKET = "supplier-bill-cfdi-xml";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (un XML CFDI rara vez supera 100 KB)

export interface UploadedCfdiXml {
  path: string;
  signedUrl: string;
}

export function useUploadSupplierBillXml() {
  return useMutation({
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
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signErr || !signed) throw signErr ?? new Error("No se pudo firmar la URL");
      return { path, signedUrl: signed.signedUrl };
    },
    onError: (e: unknown) => notifyError({ error: e, message: "No se pudo subir el XML" }),
  });
}

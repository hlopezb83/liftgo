import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { organizationStoragePathForSession } from "@/lib/storage/organizationPath";

const BUCKET = "supplier-bill-cfdi-xml";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (un XML CFDI rara vez supera 100 KB)

export interface UploadedCfdiXml {
  path: string;
}

/** Only for an import that was abandoned before its result reached the form. */
export async function discardImportedCfdiXml(path: string): Promise<void> {
  try { await supabase.storage.from(BUCKET).remove([path]); }
  catch { /* Storage cleanup is best-effort; never revive an abandoned import. */ }
}

export function useUploadSupplierBillXml() {
  return useEntityMutation({
    mutationFn: async ({
      file,
      uuid,
      shouldContinue,
    }: { file: File; uuid: string | null; shouldContinue?: () => boolean }): Promise<UploadedCfdiXml> => {
      const assertCurrent = () => {
        if (shouldContinue && !shouldContinue()) throw new Error("La captura del XML ya no está activa");
      };
      assertCurrent();
      if (file.size > MAX_BYTES) throw new Error("El XML excede 2 MB");
      const folder = uuid ?? "sin-uuid";
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const relativePath = `${folder}/${crypto.randomUUID()}-${safeName}`;
      const path = await organizationStoragePathForSession(supabase, relativePath);
      assertCurrent();
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: "application/xml",
        upsert: false,
      });
      if (upErr) throw upErr;
      try { assertCurrent(); }
      catch (error) {
        await discardImportedCfdiXml(path);
        throw error;
      }
      // N-9: sólo se persiste el `path`; la firma se hace on-demand con TTL
      // corto en el punto de lectura (openStoredFile).
      return { path };
    },
    errorTitle: "No se pudo subir el XML",
    onError: (_error, vars) => vars.shouldContinue ? !vars.shouldContinue() : false,
  });
}

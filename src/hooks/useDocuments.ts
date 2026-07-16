import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { documentsQueries, extractStoragePath, type DocumentsFilter } from "@/lib/query/documentsQueryKeys";

export function useDocuments(entityType: string, entityId: string | undefined) {
  const filter: DocumentsFilter = { entityType, entityId };
  return useQuery({
    ...documentsQueries.list(filter),
    enabled: !!entityId,
  });
}

export function useUploadDocument() {
  return useEntityMutation({
    mutationFn: async ({
      file,
      entityType,
      entityId,
    }: {
      file: File;
      entityType: string;
      entityId: string;
    }) => {
      // Supabase Storage rechaza claves fuera de [a-zA-Z0-9!\-_.*'()/]. Los XML
      // CFDI y PDFs de proveedores suelen traer espacios, acentos y ñ, lo que
      // provocaba "Invalid key". Se conserva el file.name original en la fila
      // documents; sólo se sanea el path físico.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
      const filePath = `${entityType}/${entityId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      // Store the storage path as file_url (relative). Signed URLs are generated on read.
      const storedUrl = `documents/${filePath}`;

      const { data, error } = await supabase
        .from("documents")
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          file_name: file.name,
          file_url: storedUrl,
          file_size: file.size,
          mime_type: file.type,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [documentsQueries.keys.all],
    errorTitle: "Error al subir el documento",
  });
}

export function useDeleteDocument() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { data: doc } = await supabase
        .from("documents")
        .select("file_url")
        .eq("id", id)
        .maybeSingle();
      const path = doc?.file_url ? extractStoragePath(doc.file_url) : null;
      if (path) {
        await supabase.storage.from("documents").remove([path]);
      }
      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [documentsQueries.keys.all],
    errorTitle: "Error al eliminar el documento",
  });
}

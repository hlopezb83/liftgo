import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

function extractStoragePath(fileUrl: string): string | null {
  const marker = "/documents/";
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  return fileUrl.slice(idx + marker.length);
}

async function attachSignedUrls<T extends { file_url: string }>(rows: T[]): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => {
      const path = extractStoragePath(row.file_url);
      if (!path) return row;
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      return data?.signedUrl ? { ...row, file_url: data.signedUrl } : row;
    }),
  );
}

export function useDocuments(entityType: string, entityId: string | undefined) {
  return useQuery({
    queryKey: ["documents", entityType, entityId],
    enabled: !!entityId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return attachSignedUrls(data ?? []);
    },
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      entityType,
      entityId,
    }: {
      file: File;
      entityType: string;
      entityId: string;
    }) => {
      const filePath = `${entityType}/${entityId}/${Date.now()}_${file.name}`;
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });
}

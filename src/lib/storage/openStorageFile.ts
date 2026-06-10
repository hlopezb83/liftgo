import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEFAULT_TTL_SECONDS = 60;

/**
 * Opens a file stored in a Supabase Storage bucket in a new tab via a short-lived
 * signed URL. Centralizes auth, TTL and user-facing error feedback so call-sites
 * stay free of `supabase.storage` plumbing.
 */
export async function openStorageFile(
  bucket: string,
  path: string,
  options?: { ttlSeconds?: number; errorMessage?: string },
): Promise<void> {
  const ttl = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
  if (error || !data?.signedUrl) {
    toast.error(options?.errorMessage ?? "No se pudo abrir el archivo");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

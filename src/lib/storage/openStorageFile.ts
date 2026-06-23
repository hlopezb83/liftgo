import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/lib/ui/appFeedback";

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
    notifyError({
      error,
      title: options?.errorMessage ?? "No se pudo abrir el archivo",
      phase: "storage.createSignedUrl",
      context: { bucket, path },
      severity: "warning",
    });
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

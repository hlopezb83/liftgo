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

/**
 * Multiempresa: una URL firmada persistida (TTL de 5 años en registros legacy)
 * es un permiso congelado que ignora las policies actuales de `storage.objects`,
 * incluido el alcance por organización. Por eso NO se abren tal cual:
 *  - si la URL apunta al Storage del propio proyecto, se extraen bucket y ruta
 *    y se vuelve a firmar con la sesión actual (RLS aplica hoy, no cuando se
 *    generó el enlace);
 *  - cualquier otra URL se rechaza (fail-closed) en lugar de abrirse.
 */
export function parseStorageUrl(
  url: string,
): { bucket: string; path: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const base = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  if (!base) return null;
  let baseOrigin: string;
  try {
    baseOrigin = new URL(base).origin;
  } catch {
    return null;
  }
  if (parsed.origin !== baseOrigin) return null;

  const match = parsed.pathname.match(
    /^\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/,
  );
  if (!match) return null;

  const bucket = decodeURIComponent(match[1]);
  const path = match[2].split("/").map(decodeURIComponent).join("/");
  if (!bucket || !path || path.split("/").some((s) => s === "" || s === "..")) {
    return null;
  }
  return { bucket, path };
}

/**
 * N-9: abre un archivo cuyo valor persistido puede ser un `path` de Storage
 * (nuevo) o una URL completa (registros legacy). Los paths se firman on-demand
 * con TTL corto; las URLs de Storage del proyecto se re-firman con la sesión
 * actual; el resto no se abre.
 */
export async function openStoredFile(
  bucket: string,
  pathOrUrl: string,
  options?: { ttlSeconds?: number; errorMessage?: string },
): Promise<void> {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const parsed = parseStorageUrl(pathOrUrl);
    if (!parsed || (bucket && parsed.bucket !== bucket)) {
      notifyError({
        error: new Error("Enlace almacenado no verificable"),
        title: options?.errorMessage ?? "No se pudo abrir el archivo",
        phase: "storage.legacyUrlRejected",
        context: { bucket },
        severity: "warning",
      });
      return;
    }
    await openStorageFile(parsed.bucket, parsed.path, options);
    return;
  }
  await openStorageFile(bucket, pathOrUrl, options);
}

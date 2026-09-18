/**
 * Multiempresa · resolución segura del logo de empresa.
 *
 * `company_settings.logo_url` puede contener tres cosas históricas:
 *  - una ruta de Storage (`<organizacion>/company/logo_x.png`) — formato nuevo;
 *  - una URL del Storage de ESTE proyecto (`/storage/v1/object/{sign|public|
 *    authenticated}/<bucket>/<ruta>`) — se acepta re-firmando con la sesión
 *    actual, de modo que las policies por organización se evalúan HOY;
 *  - cualquier otro valor (host externo, data URI, enlace no verificable) —
 *    se rechaza fail-closed y la interfaz cae al distintivo tipográfico.
 *
 * Nunca se renderiza ni se descarga un valor desconocido: un `<img src>` o un
 * `fetch()` directo sobre un host arbitrario filtra la sesión/el referer y
 * puede mostrar el logo de otra empresa si el valor fuese manipulado.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseStorageUrl } from "@/lib/storage/openStorageFile";

/** Bucket donde la aplicación guarda los logos subidos. */
export const LOGO_BUCKET = "documents";

/** TTL corto: el enlace firmado es de visualización, no un permiso persistido. */
export const LOGO_SIGNED_TTL_SECONDS = 300;

export type LogoSource =
  | { kind: "storage"; bucket: string; path: string }
  | { kind: "unsupported" };

const UNSUPPORTED: LogoSource = { kind: "unsupported" };

function validPath(path: string): boolean {
  if (!path) return false;
  return !path
    .split("/")
    .some((part) => !part || part === "." || part === "..");
}

/**
 * Clasifica el valor persistido sin hacer red. Devuelve `unsupported` para
 * cualquier cosa que no sea una ruta relativa o una URL del Storage propio.
 */
export function classifyLogoSource(
  value: string | null | undefined,
  bucket: string = LOGO_BUCKET,
): LogoSource {
  const raw = (value ?? "").trim();
  if (!raw) return UNSUPPORTED;

  if (/^https?:\/\//i.test(raw)) {
    const parsed = parseStorageUrl(raw);
    if (!parsed) return UNSUPPORTED;
    return { kind: "storage", bucket: parsed.bucket, path: parsed.path };
  }

  // Cualquier otro esquema (data:, blob:, javascript:, //host) se rechaza.
  if (raw.includes(":") || raw.startsWith("//")) return UNSUPPORTED;

  const path = raw.replace(/^\/+/, "");
  if (!validPath(path)) return UNSUPPORTED;
  return { kind: "storage", bucket, path };
}

type SignerClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        ttl: number,
      ) => PromiseLike<{
        data: { signedUrl: string } | null;
        error: unknown;
      }>;
    };
  };
};

/**
 * Firma el logo con la sesión actual (RLS de `storage.objects` aplica). El
 * aislamiento entre empresas lo garantizan las policies: la fila de
 * `company_settings` ya viene de la organización del contexto autenticado y
 * la firma falla si esa ruta no pertenece a la organización de la sesión.
 */
export async function resolveLogoSrc(
  value: string | null | undefined,
  options?: { client?: SignerClient; ttlSeconds?: number; bucket?: string },
): Promise<string | null> {
  const source = classifyLogoSource(value, options?.bucket ?? LOGO_BUCKET);
  if (source.kind !== "storage") return null;

  const client = options?.client ?? (supabase as unknown as SignerClient);
  const ttl = options?.ttlSeconds ?? LOGO_SIGNED_TTL_SECONDS;
  const { data, error } = await client.storage
    .from(source.bucket)
    .createSignedUrl(source.path, ttl);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

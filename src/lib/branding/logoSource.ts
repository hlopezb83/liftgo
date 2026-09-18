/**
 * Multiempresa · resolución del logo mostrado en la aplicación.
 *
 * Hay DOS tipos de logo y no deben mezclarse:
 *
 *  1. **Logo de empresa (tenant)**: el que se sube desde Configuración. Se
 *     persiste como ruta de Storage (`<organizacion>/company/logo_x.png`) o,
 *     históricamente, como URL del Storage de ESTE proyecto. Se resuelve
 *     SIEMPRE re-firmando con la sesión actual: las policies por organización
 *     se evalúan hoy, así que una empresa no puede mostrar el logo de otra.
 *
 *  2. **Marca global de LiftGo**: imagen de marca del producto, compartida
 *     deliberadamente por todas las empresas. Es una imagen pública alojada
 *     fuera del Storage del proyecto; no es dato de un tenant, no requiere
 *     traslado ni aislamiento A/B. Se muestra como imagen estática: se sirve
 *     por HTTPS, sin credenciales, sin cookies y sin referer, y nunca se
 *     re-firma ni se trata como archivo privado.
 *
 * Todo lo demás (data:, blob:, javascript:, `//host`, rutas con salto de
 * nivel) se rechaza fail-closed: no se renderiza ni se descarga.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseStorageUrl } from "@/lib/storage/openStorageFile";

/** Bucket donde la aplicación guarda los logos subidos. */
export const LOGO_BUCKET = "documents";

/** TTL corto: el enlace firmado es de visualización, no un permiso persistido. */
export const LOGO_SIGNED_TTL_SECONDS = 300;

export type LogoSource =
  /** Logo subido por la empresa: aislado por organización vía Storage + RLS. */
  | { kind: "storage"; bucket: string; path: string }
  /** Marca global de LiftGo: imagen pública compartida, sin datos de tenant. */
  | { kind: "global-brand"; url: string }
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

  if (/^https:\/\//i.test(raw)) {
    const parsed = parseStorageUrl(raw);
    if (parsed) {
      // Storage propio: logo de empresa, se re-firma con la sesión actual.
      return { kind: "storage", bucket: parsed.bucket, path: parsed.path };
    }
    // Imagen pública de marca: sólo HTTPS, sin credenciales ni referer.
    return { kind: "global-brand", url: raw };
  }

  // HTTP en claro nunca se acepta (contenido mixto y manipulable en tránsito).
  if (/^http:\/\//i.test(raw)) return UNSUPPORTED;

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
 * Devuelve la URL de visualización.
 *
 * - Logo de empresa: se firma con la sesión actual (RLS de `storage.objects`
 *   aplica), así que una organización no puede resolver la ruta de otra.
 * - Marca global de LiftGo: se devuelve la URL pública tal cual, para
 *   mostrarla como imagen estática sin credenciales.
 */
export async function resolveLogoSrc(
  value: string | null | undefined,
  options?: { client?: SignerClient; ttlSeconds?: number; bucket?: string },
): Promise<string | null> {
  const source = classifyLogoSource(value, options?.bucket ?? LOGO_BUCKET);
  if (source.kind === "global-brand") return source.url;
  if (source.kind !== "storage") return null;

  const client = options?.client ?? (supabase as unknown as SignerClient);
  const ttl = options?.ttlSeconds ?? LOGO_SIGNED_TTL_SECONDS;
  const { data, error } = await client.storage
    .from(source.bucket)
    .createSignedUrl(source.path, ttl);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

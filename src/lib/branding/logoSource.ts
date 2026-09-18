/**
 * Multiempresa · resolución del **logo empresarial configurable**
 * (`company_settings.logo_url`).
 *
 * Alcance: sólo documentos y pantallas de la empresa (PDF de cotización,
 * factura, contrato, estado de cuenta y la propia Configuración). **No** es la
 * marca de producto: la navegación/sidebar usa el asset global LiftGo del
 * repositorio, servido desde fuente local fija y ajeno a este módulo.
 *
 * Valores aceptados, siempre con aislamiento por tenant:
 *  - ruta de Storage (`<organizacion>/company/logo_x.png`) — formato actual;
 *  - URL del Storage de ESTE proyecto — se re-firma con la sesión actual, de
 *    modo que las policies por organización se evalúan hoy.
 *
 * Cualquier otro valor (host ajeno, http en claro, `data:`, `blob:`, `//host`,
 * rutas con salto de nivel) se rechaza fail-closed: no se renderiza ni se
 * descarga. Un `<img src>` o un `fetch()` sobre un host arbitrario filtraría
 * sesión/referer y podría mostrar contenido de otra empresa.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseStorageUrl } from "@/lib/storage/openStorageFile";

/** Bucket donde la aplicación guarda los logos subidos. */
export const LOGO_BUCKET = "documents";

/** TTL corto: el enlace firmado es de visualización, no un permiso persistido. */
export const LOGO_SIGNED_TTL_SECONDS = 300;

export type LogoSource =
  /** Logo subido por la empresa: aislado por organización vía Storage + RLS. */
  { kind: "storage"; bucket: string; path: string } | { kind: "unsupported" };

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
    if (!parsed) return UNSUPPORTED;
    // Storage propio: logo de empresa, se re-firma con la sesión actual.
    return { kind: "storage", bucket: parsed.bucket, path: parsed.path };
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
 * Firma el logo empresarial con la sesión actual (RLS de `storage.objects`
 * aplica): una organización no puede resolver la ruta de otra. Fail-closed
 * para cualquier valor no verificable.
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

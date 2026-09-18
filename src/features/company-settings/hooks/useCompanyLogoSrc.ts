import { useQuery } from "@tanstack/react-query";
import {
  LOGO_SIGNED_TTL_SECONDS,
  classifyLogoSource,
  resolveLogoSrc,
} from "@/lib/branding/logoSource";

/**
 * Devuelve la URL de visualización del logo.
 *
 * - Marca global de LiftGo (imagen pública compartida): se devuelve directa,
 *   sin firmar; no es dato de una empresa.
 * - Logo subido por la empresa: se firma con la sesión actual y TTL corto, de
 *   modo que el aislamiento por organización lo imponen las policies.
 * - Cualquier otro valor: `null` y la interfaz usa el distintivo de respaldo.
 */
export function useCompanyLogoSrc(
  logoUrl: string | null | undefined,
): string | null {
  const source = classifyLogoSource(logoUrl);
  if (source.kind === "global-brand") return source.url;
  const key =
    source.kind === "storage" ? `${source.bucket}/${source.path}` : null;

  const { data } = useQuery({
    queryKey: ["company_logo_src", key],
    enabled: key !== null,
    // Se refresca antes de que expire la firma; nunca se persiste el enlace.
    staleTime: (LOGO_SIGNED_TTL_SECONDS - 30) * 1000,
    gcTime: LOGO_SIGNED_TTL_SECONDS * 1000,
    queryFn: () => resolveLogoSrc(logoUrl),
  });

  return data ?? null;
}
